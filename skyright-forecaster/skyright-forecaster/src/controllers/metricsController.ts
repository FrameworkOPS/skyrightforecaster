import { Request, Response } from 'express';
import { query } from '../config/database';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import {
  calculateCrewRampUpMultiplier,
  calculateCrewRampDownMultiplier,
  isCrewBlockedByProject,
  calculateQueueGrowth,
  calculateCapacityUtilization,
  detectProductionBottleneck,
  calculateLeadTime,
  daysBetween,
  calculateAverageProductionRate
} from '../utils/calculations';
import { LEAD_TIME_THRESHOLDS, REVENUE_PER_SQ } from '../constants/businessConstants';
import { getLeadTimeStatus } from '../constants/metricsConstants';

interface CrewData {
  id: string;
  crew_name: string;
  crew_type: string;
  team_members: number;
  training_period_days: number;
  start_date: string;
  terminate_date: string | null;
  is_active: boolean;
}

interface MetricsInput {
  metricWeek: string;
  jobType: string;
}

export const calculateWeeklyMetrics = asyncHandler(async (req: Request, res: Response) => {
  const { week, jobType } = req.query;

  if (!week || !jobType) {
    throw new AppError('Missing required parameters: week and jobType', 400);
  }

  if (!['shingle', 'metal'].includes(jobType as string)) {
    throw new AppError('jobType must be either "shingle" or "metal"', 400);
  }

  // 1. Gather base data
  const pipelineResult = await query(
    `SELECT COALESCE(SUM(square_footage), 0) as total_sqs, COUNT(*) as job_count
     FROM pipeline_items
     WHERE job_type = $1 AND is_active = true AND status != 'completed'`,
    [jobType]
  );
  const pipelineSQs = parseFloat(pipelineResult.rows[0].total_sqs);

  const salesResult = await query(
    'SELECT COALESCE(projected_square_footage, 0) as total_sqs FROM sales_forecast WHERE forecast_week = $1 AND job_type = $2',
    [week, jobType]
  );
  const salesForecastSQs = parseFloat(salesResult.rows[0]?.total_sqs || 0);

  const productionResult = await query(
    `SELECT COALESCE(SUM(square_footage_completed), 0) as total_sqs
     FROM production_actuals
     WHERE production_week = $1 AND job_type = $2`,
    [week, jobType]
  );
  const productionActualSQs = parseFloat(productionResult.rows[0].total_sqs);

  // 2. Calculate effective production capacity
  const crewsResult = await query(
    `SELECT *, weekly_sq_capacity FROM crews
     WHERE crew_type = $1 AND is_active = true
     ORDER BY crew_name`,
    [jobType]
  );

  const crews: CrewData[] = crewsResult.rows;
  let totalCapacitySQs = 0;
  const weekDate = new Date(week as string);
  // Default SQ capacity per crew type if not set on the crew record
  const DEFAULT_SQ_CAPACITY: Record<string, number> = { shingle: 200, metal: 100 };

  for (const crew of crews) {
    const daysElapsed = daysBetween(crew.start_date, week as string);
    const rampUpMult = calculateCrewRampUpMultiplier(
      crew.crew_type as 'shingle' | 'metal',
      daysElapsed,
      crew.training_period_days
    );

    let rampDownMult = 1.0;
    if (crew.terminate_date) {
      rampDownMult = calculateCrewRampDownMultiplier(crew.terminate_date, weekDate);
    }

    // Check for project blocking
    const projectsResult = await query(
      `SELECT * FROM custom_projects
       WHERE crew_id = $1 AND is_active = true
       AND start_date <= $2::date AND end_date >= $3::date`,
      [crew.id, week, week]
    );

    const isBlocked = projectsResult.rows.length > 0;
    const effectiveMultiplier = isBlocked ? 0.0 : rampUpMult * rampDownMult;

    // Use crew's own weekly_sq_capacity, fallback to default by type
    const crewBaseSQCapacity = (crew as any).weekly_sq_capacity
      ? parseFloat((crew as any).weekly_sq_capacity)
      : (DEFAULT_SQ_CAPACITY[crew.crew_type] || 100);
    totalCapacitySQs += crewBaseSQCapacity * effectiveMultiplier;
  }

  // Get production rate baseline (4-week rolling average)
  const rateResult = await query(
    `SELECT AVG(square_footage_completed) as avg_rate
     FROM production_actuals
     WHERE job_type = $1
       AND production_week >= CURRENT_DATE - interval '28 days'
       AND production_week <= CURRENT_DATE`,
    [jobType]
  );

  const productionRate = parseFloat(rateResult.rows[0]?.avg_rate || 0) || (totalCapacitySQs * 0.8);

  // 3. Calculate queue dynamics
  const queueGrowth = calculateQueueGrowth(pipelineSQs, salesForecastSQs, productionRate);

  // Get previous week's queue growth for bottleneck detection
  const prevWeekDate = new Date(weekDate);
  prevWeekDate.setDate(prevWeekDate.getDate() - 7);
  const prevWeekStr = prevWeekDate.toISOString().split('T')[0];

  const prevMetricsResult = await query(
    `SELECT queue_growth FROM metrics_snapshots
     WHERE metric_week = $1 AND job_type = $2`,
    [prevWeekStr, jobType]
  );
  const previousQueueGrowth = prevMetricsResult.rows.length > 0
    ? parseFloat(prevMetricsResult.rows[0].queue_growth)
    : null;

  // 4. Lead time calculation
  const pipelineItemsResult = await query(
    `SELECT added_date, estimated_days_to_completion
     FROM pipeline_items
     WHERE job_type = $1 AND is_active = true AND status != 'completed'`,
    [jobType]
  );

  let avgLeadTimeDays = 0;
  if (pipelineItemsResult.rows.length > 0) {
    const leadTimes = pipelineItemsResult.rows.map((item: any) =>
      calculateLeadTime(item.added_date, item.estimated_days_to_completion, weekDate)
    );
    avgLeadTimeDays = Math.round(leadTimes.reduce((a: number, b: number) => a + b, 0) / leadTimes.length);
  }

  // 5. Revenue projection
  const revenuePerSq = jobType === 'shingle' ? REVENUE_PER_SQ.shingles : REVENUE_PER_SQ.metal;
  const revenueProjected = (pipelineSQs + salesForecastSQs) * revenuePerSq;
  const revenueProduced = productionActualSQs * revenuePerSq;

  // 6. Capacity utilization — fall back to production rate estimate when no actuals recorded
  const effectiveProductionSQs = productionActualSQs > 0 ? productionActualSQs : productionRate;
  const capacityUtilization = calculateCapacityUtilization(effectiveProductionSQs, totalCapacitySQs);

  // 7. Bottleneck detection
  const [bottleneckDetected, bottleneckReason] = detectProductionBottleneck(
    queueGrowth,
    previousQueueGrowth,
    capacityUtilization
  );

  // 8. Store metrics snapshot
  const insertResult = await query(
    `INSERT INTO metrics_snapshots (
       metric_week, job_type, pipeline_sqs, pipeline_jobs, sales_forecast_sqs,
       production_rate_sqs, revenue_projected, revenue_produced, queue_growth,
       avg_lead_time_days, capacity_utilization, bottleneck_detected, bottleneck_reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (metric_week, job_type) DO UPDATE SET
       pipeline_sqs = $3, pipeline_jobs = $4, sales_forecast_sqs = $5,
       production_rate_sqs = $6, revenue_projected = $7, revenue_produced = $8,
       queue_growth = $9, avg_lead_time_days = $10, capacity_utilization = $11,
       bottleneck_detected = $12, bottleneck_reason = $13
     RETURNING *`,
    [
      week, jobType, pipelineSQs, pipelineResult.rows[0].job_count,
      salesForecastSQs, productionRate, revenueProjected, revenueProduced,
      queueGrowth, avgLeadTimeDays, capacityUtilization,
      bottleneckDetected, bottleneckReason
    ]
  );

  res.json({
    success: true,
    data: insertResult.rows[0],
    message: 'Metrics calculated and stored successfully'
  });
});

export const getMetricsDashboardData = asyncHandler(async (req: Request, res: Response) => {
  const { startWeek, endWeek } = req.query;

  if (!startWeek || !endWeek) {
    throw new AppError('Missing required parameters: startWeek and endWeek', 400);
  }

  // ── 1. Live pipeline totals by job type ──────────────────────────────────
  const pipelineResult = await query(
    `SELECT job_type, COALESCE(SUM(square_footage), 0) as total_sqs, COUNT(*) as job_count
     FROM pipeline_items
     WHERE is_active = true AND status != 'completed'
     GROUP BY job_type`
  );
  const pipelineByType: Record<string, number> = {};
  const pipelineJobsByType: Record<string, number> = {};
  pipelineResult.rows.forEach((r: any) => {
    pipelineByType[r.job_type] = parseFloat(r.total_sqs) || 0;
    pipelineJobsByType[r.job_type] = parseInt(r.job_count) || 0;
  });

  // Helper: pg returns DATE columns as JS Date objects; convert to 'yyyy-MM-dd' string
  const toDateStr = (d: any): string => {
    if (d instanceof Date) return d.toISOString().split('T')[0];
    return String(d).substring(0, 10);
  };

  // ── 2. All active crews (with capacity) ──────────────────────────────────
  const crewsResult = await query(
    `SELECT id, crew_name, crew_type, training_period_days, start_date, terminate_date, weekly_sq_capacity
     FROM crews WHERE is_active = true ORDER BY crew_type, crew_name`
  );
  const allCrews = crewsResult.rows;
  const DEFAULT_SQ_CAPACITY: Record<string, number> = { shingle: 200, metal: 100 };

  // ── 3. All active custom projects (crew blocking) ────────────────────────
  const projectsResult = await query(
    `SELECT crew_id, start_date, end_date FROM custom_projects WHERE is_active = true`
  );
  // Normalise dates to strings immediately so comparisons work regardless of pg type parsing
  const allProjects = projectsResult.rows.map((p: any) => ({
    crew_id: p.crew_id,
    start_date: toDateStr(p.start_date),
    end_date: toDateStr(p.end_date),
  }));

  // ── 4. All sales forecasts for the date range ────────────────────────────
  const salesResult = await query(
    `SELECT forecast_week, job_type, COALESCE(projected_square_footage, 0) as sqs
     FROM sales_forecast
     WHERE forecast_week >= $1::date AND forecast_week <= $2::date`,
    [startWeek, endWeek]
  );
  const salesByKey: Record<string, number> = {};
  salesResult.rows.forEach((r: any) => {
    const weekKey = r.forecast_week instanceof Date
      ? r.forecast_week.toISOString().split('T')[0]
      : String(r.forecast_week).substring(0, 10);
    salesByKey[`${weekKey}_${r.job_type}`] = parseFloat(r.sqs) || 0;
  });

  // ── 5. Staff counts per job type (leads & supervisors) ───────────────────
  // DISTINCT ON picks the most recent crew_staff row per crew (ordered by
  // added_date DESC). Left-join back to crews so crews with no staff row
  // still contribute 0 rather than being excluded from the aggregate.
  const staffResult = await query(
    `WITH latest_staff AS (
       SELECT DISTINCT ON (crew_id) crew_id, lead_count, super_count
       FROM crew_staff
       ORDER BY crew_id, added_date DESC, created_at DESC
     )
     SELECT c.crew_type,
            COALESCE(SUM(ls.lead_count), 0) AS total_leads,
            COALESCE(SUM(ls.super_count), 0) AS total_supers
     FROM crews c
     LEFT JOIN latest_staff ls ON ls.crew_id = c.id
     WHERE c.is_active = true
     GROUP BY c.crew_type`
  );
  const staffByType: Record<string, { leads: number; supers: number }> = {};
  staffResult.rows.forEach((r: any) => {
    staffByType[r.crew_type] = {
      leads: parseInt(r.total_leads) || 0,
      supers: parseInt(r.total_supers) || 0,
    };
  });

  // ── 6. Build week list ────────────────────────────────────────────────────
  const weeks: string[] = [];
  const cur = new Date((startWeek as string) + 'T00:00:00');
  const endDate = new Date((endWeek as string) + 'T00:00:00');
  while (cur <= endDate) {
    weeks.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 7);
  }

  // ── 7. Compute one record per week × job type ─────────────────────────────
  const data: any[] = [];

  for (const weekStr of weeks) {
    const weekDate = new Date(weekStr + 'T00:00:00');

    for (const jobType of ['shingle', 'metal']) {
      // Production rate: sum each crew's effective capacity (0 if on a custom project)
      let productionRate = 0;
      let crewCount = 0;

      for (const crew of allCrews) {
        if (crew.crew_type !== jobType) continue;

        // Skip crew if it hasn't started yet or has been terminated.
        // Compare as 'yyyy-MM-dd' strings — safe and timezone-neutral.
        const crewStartStr = toDateStr(crew.start_date);
        if (weekStr < crewStartStr) continue;
        if (crew.terminate_date) {
          const crewEndStr = toDateStr(crew.terminate_date);
          if (weekStr > crewEndStr) continue;
        }

        crewCount++;

        // Zero out if crew is blocked by a custom project this week.
        // allProjects dates are already normalised to 'yyyy-MM-dd' strings so
        // string comparison is safe and avoids any JS Date parsing issues.
        const isBlocked = allProjects.some((p: any) => {
          if (p.crew_id !== crew.id) return false;
          return weekStr >= p.start_date && weekStr <= p.end_date;
        });

        if (isBlocked) continue;

        const daysElapsed = daysBetween(crew.start_date, weekStr);
        const rampUp = calculateCrewRampUpMultiplier(
          crew.crew_type as 'shingle' | 'metal',
          daysElapsed,
          parseInt(crew.training_period_days)
        );
        let rampDown = 1.0;
        if (crew.terminate_date) {
          rampDown = calculateCrewRampDownMultiplier(crew.terminate_date, weekDate);
        }

        const crewCap = crew.weekly_sq_capacity
          ? parseFloat(crew.weekly_sq_capacity)
          : (DEFAULT_SQ_CAPACITY[jobType] || 100);

        productionRate += crewCap * rampUp * rampDown;
      }

      const pipelineSqs = pipelineByType[jobType] || 0;
      const salesForecastSqs = salesByKey[`${weekStr}_${jobType}`] || 0;
      const revenuePerSq = jobType === 'shingle' ? REVENUE_PER_SQ.shingles : REVENUE_PER_SQ.metal;

      // Lead time in days: (pipeline / weekly_rate) × 7
      const avgLeadTimeDays = productionRate > 0
        ? Math.round((pipelineSqs / productionRate) * 7)
        : 0;
      const leadTimeWeeks = Math.round(avgLeadTimeDays / 7);
      const leadTimeStatus = getLeadTimeStatus(leadTimeWeeks);

      const staff = staffByType[jobType] || { leads: 0, supers: 0 };

      data.push({
        metric_week: weekStr,
        job_type: jobType,
        pipeline_sqs: Math.round(pipelineSqs),
        pipeline_jobs: pipelineJobsByType[jobType] || 0,
        sales_forecast_sqs: Math.round(salesForecastSqs),
        production_rate_sqs: Math.round(productionRate),
        revenue_projected: Math.round((pipelineSqs + salesForecastSqs) * revenuePerSq),
        revenue_produced: 0,
        avg_lead_time_days: avgLeadTimeDays,
        queue_growth: salesForecastSqs - productionRate,
        bottleneck_detected: productionRate > 0 && (pipelineSqs / productionRate) > 8,
        bottleneck_reason: null,
        leadTimeWeeks,
        leadTimeStatus,
        crewCount,
        totalLeads: staff.leads,
        totalSupervisors: staff.supers,
        revenue_per_sq: revenuePerSq,
      });
    }
  }

  res.json({ success: true, data });
});

export const getLeadTimeAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { jobType, weeks = 4 } = req.query;

  if (!jobType) {
    throw new AppError('jobType parameter is required', 400);
  }

  if (!['shingle', 'metal'].includes(jobType as string)) {
    throw new AppError('jobType must be either "shingle" or "metal"', 400);
  }

  // Get recent metrics
  const numWeeks = parseInt(weeks as string);
  const result = await query(
    `SELECT
       job_type,
       AVG(CAST(avg_lead_time_days AS NUMERIC)) as current_lead_time,
       MAX(CAST(avg_lead_time_days AS NUMERIC)) as max_lead_time,
       MIN(CAST(avg_lead_time_days AS NUMERIC)) as min_lead_time,
       COUNT(*) as weeks_analyzed
     FROM metrics_snapshots
     WHERE job_type = $1
       AND metric_week >= CURRENT_DATE - ($2 || ' weeks')::interval
     GROUP BY job_type`,
    [jobType, numWeeks]
  );

  if (result.rows.length === 0) {
    return res.json({
      success: true,
      data: {
        jobType,
        currentLeadTime: 0,
        avgLeadTime: 0,
        maxLeadTime: 0,
        minLeadTime: 0,
        weeksAnalyzed: 0,
        trend: 'no_data'
      }
    });
  }

  const row = result.rows[0];
  const currentLeadTime = parseFloat(row.current_lead_time || 0);
  const avgLeadTime = parseFloat(row.current_lead_time || 0);

  // Determine trend
  let trend = 'stable';
  if (currentLeadTime > avgLeadTime * 1.1) {
    trend = 'increasing';
  } else if (currentLeadTime < avgLeadTime * 0.9) {
    trend = 'decreasing';
  }

  res.json({
    success: true,
    data: {
      jobType: row.job_type,
      currentLeadTime: Math.round(currentLeadTime),
      avgLeadTime: Math.round(avgLeadTime),
      maxLeadTime: Math.round(parseFloat(row.max_lead_time || 0)),
      minLeadTime: Math.round(parseFloat(row.min_lead_time || 0)),
      weeksAnalyzed: parseInt(row.weeks_analyzed),
      trend
    }
  });
});

export const getRevenueAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { startWeek, endWeek, jobType } = req.query;

  let whereClause = '';
  const params: any[] = [];
  let paramCount = 1;

  if (startWeek) {
    whereClause += ` AND metric_week >= $${paramCount}`;
    params.push(startWeek);
    paramCount++;
  }

  if (endWeek) {
    whereClause += ` AND metric_week <= $${paramCount}`;
    params.push(endWeek);
    paramCount++;
  }

  if (jobType) {
    if (!['shingle', 'metal'].includes(jobType as string)) {
      throw new AppError('jobType must be either "shingle" or "metal"', 400);
    }
    whereClause += ` AND job_type = $${paramCount}`;
    params.push(jobType);
  }

  const query_text = `SELECT
     job_type,
     COALESCE(SUM(revenue_projected), 0) as total_projected,
     COALESCE(SUM(revenue_produced), 0) as total_produced,
     COUNT(*) as weeks_analyzed,
     AVG(revenue_projected) as avg_projected,
     AVG(revenue_produced) as avg_produced
   FROM metrics_snapshots
   WHERE 1=1 ${whereClause}
   GROUP BY job_type
   ORDER BY job_type`;

  const result = await query(query_text, params);

  const byType: { [key: string]: any } = {};
  let combinedProjected = 0;
  let combinedProduced = 0;

  result.rows.forEach((row: any) => {
    const projected = parseFloat(row.total_projected || 0);
    const produced = parseFloat(row.total_produced || 0);

    byType[row.job_type] = {
      jobType: row.job_type,
      totalProjected: projected.toFixed(0),
      totalProduced: produced.toFixed(0),
      variance: (produced - projected).toFixed(0),
      weeksAnalyzed: parseInt(row.weeks_analyzed),
      avgProjected: parseFloat(row.avg_projected || 0).toFixed(0),
      avgProduced: parseFloat(row.avg_produced || 0).toFixed(0)
    };

    combinedProjected += projected;
    combinedProduced += produced;
  });

  res.json({
    success: true,
    data: {
      byType,
      combined: {
        totalProjected: combinedProjected.toFixed(0),
        totalProduced: combinedProduced.toFixed(0),
        variance: (combinedProduced - combinedProjected).toFixed(0),
        accuracyPercent: combinedProjected > 0
          ? ((combinedProduced / combinedProjected) * 100).toFixed(1)
          : '0'
      }
    }
  });
});

export const getCapacityAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { jobType, weeks = 4 } = req.query;

  if (!jobType) {
    throw new AppError('jobType parameter is required', 400);
  }

  if (!['shingle', 'metal'].includes(jobType as string)) {
    throw new AppError('jobType must be either "shingle" or "metal"', 400);
  }

  const numWeeks = parseInt(weeks as string);
  const result = await query(
    `SELECT
       job_type,
       AVG(CAST(capacity_utilization AS NUMERIC)) as avg_utilization,
       MAX(CAST(capacity_utilization AS NUMERIC)) as max_utilization,
       MIN(CAST(capacity_utilization AS NUMERIC)) as min_utilization,
       COUNT(CASE WHEN bottleneck_detected = true THEN 1 END) as bottleneck_weeks,
       COUNT(*) as total_weeks
     FROM metrics_snapshots
     WHERE job_type = $1
       AND metric_week >= CURRENT_DATE - ($2 || ' weeks')::interval
     GROUP BY job_type`,
    [jobType, numWeeks]
  );

  if (result.rows.length === 0) {
    return res.json({
      success: true,
      data: {
        jobType,
        avgUtilization: 0,
        maxUtilization: 0,
        bottleneckWeeks: 0,
        totalWeeks: 0,
        recommendations: ['No capacity data available yet']
      }
    });
  }

  const row = result.rows[0];
  const avgUtil = parseFloat(row.avg_utilization || 0);
  const bottleneckCount = parseInt(row.bottleneck_weeks);
  const totalWeeks = parseInt(row.total_weeks);

  const recommendations: string[] = [];

  if (avgUtil > 0.85) {
    recommendations.push('Consider increasing crew capacity or adjusting production schedule');
  }

  if (bottleneckCount > totalWeeks / 2) {
    recommendations.push('Frequent bottlenecks detected - review crew sizing or production rates');
  }

  if (avgUtil < 0.5) {
    recommendations.push('Low utilization - consider optimizing crew allocation or sales strategy');
  }

  if (recommendations.length === 0) {
    recommendations.push('Capacity utilization is healthy');
  }

  res.json({
    success: true,
    data: {
      jobType: row.job_type,
      avgUtilization: (avgUtil * 100).toFixed(1),
      maxUtilization: (parseFloat(row.max_utilization || 0) * 100).toFixed(1),
      minUtilization: (parseFloat(row.min_utilization || 0) * 100).toFixed(1),
      bottleneckWeeks: bottleneckCount,
      totalWeeks: totalWeeks,
      bottleneckPercentage: ((bottleneckCount / totalWeeks) * 100).toFixed(1),
      recommendations
    }
  });
});
