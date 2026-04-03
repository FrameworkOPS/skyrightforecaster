import { Request, Response } from 'express';
import { query } from '../config/database';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import {
  calculateCrewRampUpMultiplier,
  calculateCrewRampDownMultiplier,
  calculateQueueGrowth,
  calculateCapacityUtilization,
  detectProductionBottleneck,
  calculateLeadTime,
  daysBetween,
} from '../utils/calculations';
import { LEAD_TIME_THRESHOLDS, REVENUE_PER_SQ } from '../constants/businessConstants';
import { getLeadTimeStatus } from '../constants/metricsConstants';

// ─── Shared helpers ────────────────────────────────────────────────────────

const toDateStr = (d: any): string => {
  if (d instanceof Date) return d.toISOString().split('T')[0];
  return String(d).substring(0, 10);
};

const DEFAULT_SQ_CAPACITY: Record<string, number> = { shingle: 200, metal: 100 };

// ─── calculateWeeklyMetrics (unchanged — used by POST /calculate) ──────────

export const calculateWeeklyMetrics = asyncHandler(async (req: Request, res: Response) => {
  const { week, jobType } = req.query;

  if (!week || !jobType) throw new AppError('Missing required parameters: week and jobType', 400);
  if (!['shingle', 'metal'].includes(jobType as string))
    throw new AppError('jobType must be either "shingle" or "metal"', 400);

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

  const crewsResult = await query(
    `SELECT *, weekly_sq_capacity FROM crews WHERE crew_type = $1 AND is_active = true ORDER BY crew_name`,
    [jobType]
  );
  const crews = crewsResult.rows;
  let totalCapacitySQs = 0;
  const weekDate = new Date(week as string);

  for (const crew of crews) {
    const daysElapsed = daysBetween(crew.start_date, week as string);
    const rampUpMult = calculateCrewRampUpMultiplier(
      crew.crew_type as 'shingle' | 'metal', daysElapsed, crew.training_period_days
    );
    let rampDownMult = 1.0;
    if (crew.terminate_date) rampDownMult = calculateCrewRampDownMultiplier(crew.terminate_date, weekDate);

    const projectsResult = await query(
      `SELECT * FROM custom_projects WHERE crew_id = $1 AND is_active = true AND start_date <= $2::date AND end_date >= $3::date`,
      [crew.id, week, week]
    );
    const isBlocked = projectsResult.rows.length > 0;
    const effectiveMultiplier = isBlocked ? 0.0 : rampUpMult * rampDownMult;
    const crewBaseSQCapacity = (crew as any).weekly_sq_capacity
      ? parseFloat((crew as any).weekly_sq_capacity)
      : (DEFAULT_SQ_CAPACITY[crew.crew_type] || 100);
    totalCapacitySQs += crewBaseSQCapacity * effectiveMultiplier;
  }

  const revenuePerSq = jobType === 'shingle' ? REVENUE_PER_SQ.shingles : REVENUE_PER_SQ.metal;
  const revenueProjected = totalCapacitySQs * revenuePerSq;
  const queueGrowth = calculateQueueGrowth(pipelineSQs, salesForecastSQs, totalCapacitySQs);
  const avgLeadTimeDays = totalCapacitySQs > 0 ? Math.round((pipelineSQs / totalCapacitySQs) * 7) : 0;
  const capacityUtilization = calculateCapacityUtilization(totalCapacitySQs, totalCapacitySQs);
  const [bottleneckDetected, bottleneckReason] = detectProductionBottleneck(queueGrowth, null, capacityUtilization);

  const insertResult = await query(
    `INSERT INTO metrics_snapshots (
       metric_week, job_type, pipeline_sqs, pipeline_jobs, sales_forecast_sqs,
       production_rate_sqs, revenue_projected, revenue_produced, queue_growth,
       avg_lead_time_days, capacity_utilization, bottleneck_detected, bottleneck_reason
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (metric_week, job_type) DO UPDATE SET
       pipeline_sqs=$3, pipeline_jobs=$4, sales_forecast_sqs=$5, production_rate_sqs=$6,
       revenue_projected=$7, revenue_produced=$8, queue_growth=$9, avg_lead_time_days=$10,
       capacity_utilization=$11, bottleneck_detected=$12, bottleneck_reason=$13
     RETURNING *`,
    [week, jobType, pipelineSQs, pipelineResult.rows[0].job_count, salesForecastSQs,
     totalCapacitySQs, revenueProjected, 0, queueGrowth, avgLeadTimeDays,
     capacityUtilization, bottleneckDetected, bottleneckReason]
  );

  res.json({ success: true, data: insertResult.rows[0], message: 'Metrics calculated and stored successfully' });
});

// ─── Main dashboard endpoint ───────────────────────────────────────────────

export const getMetricsDashboardData = asyncHandler(async (req: Request, res: Response) => {
  const { startWeek, endWeek } = req.query;
  if (!startWeek || !endWeek) throw new AppError('Missing required parameters: startWeek and endWeek', 400);

  // ── 1. Current pipeline snapshot ────────────────────────────────────────
  const pipelineResult = await query(
    `SELECT job_type, COALESCE(SUM(square_footage), 0) as total_sqs, COUNT(*) as job_count
     FROM pipeline_items WHERE is_active = true AND status != 'completed' GROUP BY job_type`
  );
  const pipelineByType: Record<string, number> = {};
  const pipelineJobsByType: Record<string, number> = {};
  pipelineResult.rows.forEach((r: any) => {
    pipelineByType[r.job_type] = parseFloat(r.total_sqs) || 0;
    pipelineJobsByType[r.job_type] = parseInt(r.job_count) || 0;
  });

  // ── 2. All active crews ──────────────────────────────────────────────────
  const crewsResult = await query(
    `SELECT id, crew_name, crew_type, training_period_days, start_date, terminate_date, weekly_sq_capacity
     FROM crews WHERE is_active = true ORDER BY crew_type, crew_name`
  );
  const allCrews = crewsResult.rows;

  // ── 3. Custom projects (crew blocking) ──────────────────────────────────
  const projectsResult = await query(
    `SELECT crew_id, start_date, end_date FROM custom_projects WHERE is_active = true`
  );
  const allProjects = projectsResult.rows.map((p: any) => ({
    crew_id: p.crew_id,
    start_date: toDateStr(p.start_date),
    end_date: toDateStr(p.end_date),
  }));

  // ── 4. Sales forecasts ───────────────────────────────────────────────────
  const salesResult = await query(
    `SELECT forecast_week, job_type, COALESCE(projected_square_footage, 0) as sqs
     FROM sales_forecast WHERE forecast_week >= $1::date AND forecast_week <= $2::date`,
    [startWeek, endWeek]
  );
  const salesByKey: Record<string, number> = {};
  salesResult.rows.forEach((r: any) => {
    const wk = r.forecast_week instanceof Date
      ? r.forecast_week.toISOString().split('T')[0]
      : String(r.forecast_week).substring(0, 10);
    salesByKey[`${wk}_${r.job_type}`] = parseFloat(r.sqs) || 0;
  });

  // ── 5. Staff per crew (latest record per crew, using ROW_NUMBER for reliability) ──
  // Using ROW_NUMBER() instead of DISTINCT ON to avoid issues if added_date column
  // is missing or NULL; created_at is always present.
  const staffResult = await query(
    `WITH ranked_staff AS (
       SELECT crew_id, lead_count, super_count,
              ROW_NUMBER() OVER (PARTITION BY crew_id ORDER BY created_at DESC) AS rn
       FROM crew_staff
     )
     SELECT c.id as crew_id, c.crew_name, c.crew_type,
            COALESCE(rs.lead_count, 0) AS lead_count,
            COALESCE(rs.super_count, 0) AS super_count
     FROM crews c
     LEFT JOIN ranked_staff rs ON rs.crew_id = c.id AND rs.rn = 1
     WHERE c.is_active = true
     ORDER BY c.crew_type, c.crew_name`
  );
  // Index by crew_id for quick lookup
  const staffByCrew: Record<string, { leads: number; supers: number; crew_name: string; crew_type: string }> = {};
  staffResult.rows.forEach((r: any) => {
    staffByCrew[r.crew_id] = {
      leads: parseInt(r.lead_count) || 0,
      supers: parseInt(r.super_count) || 0,
      crew_name: r.crew_name,
      crew_type: r.crew_type,
    };
  });

  // ── 6. Week list ─────────────────────────────────────────────────────────
  const weeks: string[] = [];
  const cur = new Date((startWeek as string) + 'T00:00:00');
  const endDate = new Date((endWeek as string) + 'T00:00:00');
  while (cur <= endDate) {
    weeks.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 7);
  }

  // ── 7. Rolling pipeline (starts at current snapshot, depleted/grown each week) ─
  const rollingPipeline: Record<string, number> = {
    shingle: pipelineByType['shingle'] || 0,
    metal:   pipelineByType['metal']   || 0,
  };

  // ── 8. Build weekly records ───────────────────────────────────────────────
  const data: any[] = [];

  for (const weekStr of weeks) {
    const weekDate = new Date(weekStr + 'T00:00:00');

    for (const jobType of ['shingle', 'metal']) {
      let productionRate = 0;
      let crewCount = 0;

      // Per-crew detail for drill-down (included in current week)
      const crewDetails: Array<{
        id: string; name: string; weeklyCapacity: number;
        productionRate: number; rampPercent: number; isBlocked: boolean;
        leads: number; supers: number;
      }> = [];

      for (const crew of allCrews) {
        if (crew.crew_type !== jobType) continue;

        const crewStartStr = toDateStr(crew.start_date);
        if (weekStr < crewStartStr) continue;
        if (crew.terminate_date) {
          const crewEndStr = toDateStr(crew.terminate_date);
          if (weekStr > crewEndStr) continue;
        }

        crewCount++;

        const isBlocked = allProjects.some((p: any) =>
          p.crew_id === crew.id && weekStr >= p.start_date && weekStr <= p.end_date
        );

        const daysElapsed = daysBetween(crew.start_date, weekStr);
        const rampUp = calculateCrewRampUpMultiplier(
          crew.crew_type as 'shingle' | 'metal', daysElapsed, parseInt(crew.training_period_days)
        );
        let rampDown = 1.0;
        if (crew.terminate_date) rampDown = calculateCrewRampDownMultiplier(crew.terminate_date, weekDate);

        const crewCap = crew.weekly_sq_capacity
          ? parseFloat(crew.weekly_sq_capacity)
          : (DEFAULT_SQ_CAPACITY[jobType] || 100);

        const effectiveRate = isBlocked ? 0 : crewCap * rampUp * rampDown;
        productionRate += effectiveRate;

        const staff = staffByCrew[crew.id] || { leads: 0, supers: 0 };
        crewDetails.push({
          id: crew.id,
          name: crew.crew_name || 'Unnamed Crew',
          weeklyCapacity: Math.round(crewCap),
          productionRate: Math.round(effectiveRate),
          rampPercent: Math.round(rampUp * rampDown * 100),
          isBlocked,
          leads: staff.leads,
          supers: staff.supers,
        });
      }

      const pipelineSqs    = rollingPipeline[jobType];
      const salesForecastSqs = salesByKey[`${weekStr}_${jobType}`] || 0;
      const revenuePerSq   = jobType === 'shingle' ? REVENUE_PER_SQ.shingles : REVENUE_PER_SQ.metal;

      // Lead time: how many weeks of backlog at current production rate
      const avgLeadTimeDays = productionRate > 0
        ? Math.round((pipelineSqs / productionRate) * 7)
        : 0;
      const leadTimeWeeks  = Math.round(avgLeadTimeDays / 7);
      const leadTimeStatus = getLeadTimeStatus(leadTimeWeeks);

      // Revenue this week = what the crews will actually produce × rate
      const weeklyRevenue = Math.round(productionRate * revenuePerSq);
      // Pipeline value = current backlog in dollars
      const pipelineValue = Math.round(pipelineSqs * revenuePerSq);

      // Staff totals for this job type (from crew details)
      const totalLeads  = crewDetails.reduce((s, c) => s + c.leads,  0);
      const totalSupers = crewDetails.reduce((s, c) => s + c.supers, 0);

      data.push({
        metric_week:         weekStr,
        job_type:            jobType,
        pipeline_sqs:        Math.round(pipelineSqs),
        pipeline_jobs:       pipelineJobsByType[jobType] || 0,
        pipeline_value:      pipelineValue,
        sales_forecast_sqs:  Math.round(salesForecastSqs),
        production_rate_sqs: Math.round(productionRate),
        revenue_projected:   weeklyRevenue,
        revenue_produced:    0,
        avg_lead_time_days:  avgLeadTimeDays,
        queue_growth:        salesForecastSqs - productionRate,
        bottleneck_detected: productionRate > 0 && (pipelineSqs / productionRate) > 8,
        bottleneck_reason:   null,
        leadTimeWeeks,
        leadTimeStatus,
        crewCount,
        totalLeads,
        totalSupervisors:    totalSupers,
        // Crew drill-down data (used by frontend modals)
        crews:               crewDetails,
      });

      // Roll the pipeline forward for next week
      rollingPipeline[jobType] = Math.max(
        0,
        rollingPipeline[jobType] - productionRate + salesForecastSqs
      );
    }
  }

  res.json({ success: true, data });
});

// ─── Analysis endpoints (unchanged) ───────────────────────────────────────

export const getLeadTimeAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { jobType, weeks = 4 } = req.query;
  if (!jobType) throw new AppError('jobType parameter is required', 400);
  if (!['shingle', 'metal'].includes(jobType as string))
    throw new AppError('jobType must be either "shingle" or "metal"', 400);

  const numWeeks = parseInt(weeks as string);
  const result = await query(
    `SELECT job_type,
       AVG(CAST(avg_lead_time_days AS NUMERIC)) as current_lead_time,
       MAX(CAST(avg_lead_time_days AS NUMERIC)) as max_lead_time,
       MIN(CAST(avg_lead_time_days AS NUMERIC)) as min_lead_time,
       COUNT(*) as weeks_analyzed
     FROM metrics_snapshots
     WHERE job_type = $1 AND metric_week >= CURRENT_DATE - ($2 || ' weeks')::interval
     GROUP BY job_type`,
    [jobType, numWeeks]
  );

  if (result.rows.length === 0) {
    return res.json({ success: true, data: { jobType, currentLeadTime: 0, avgLeadTime: 0, maxLeadTime: 0, minLeadTime: 0, weeksAnalyzed: 0, trend: 'no_data' } });
  }
  const row = result.rows[0];
  const currentLeadTime = parseFloat(row.current_lead_time || 0);
  const avgLeadTime = parseFloat(row.current_lead_time || 0);
  const trend = currentLeadTime > avgLeadTime * 1.1 ? 'increasing' : currentLeadTime < avgLeadTime * 0.9 ? 'decreasing' : 'stable';

  res.json({ success: true, data: { jobType: row.job_type, currentLeadTime: Math.round(currentLeadTime), avgLeadTime: Math.round(avgLeadTime), maxLeadTime: Math.round(parseFloat(row.max_lead_time || 0)), minLeadTime: Math.round(parseFloat(row.min_lead_time || 0)), weeksAnalyzed: parseInt(row.weeks_analyzed), trend } });
});

export const getRevenueAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { startWeek, endWeek, jobType } = req.query;
  let whereClause = '';
  const params: any[] = [];
  let paramCount = 1;
  if (startWeek) { whereClause += ` AND metric_week >= $${paramCount}`; params.push(startWeek); paramCount++; }
  if (endWeek)   { whereClause += ` AND metric_week <= $${paramCount}`; params.push(endWeek);   paramCount++; }
  if (jobType) {
    if (!['shingle', 'metal'].includes(jobType as string)) throw new AppError('jobType must be either "shingle" or "metal"', 400);
    whereClause += ` AND job_type = $${paramCount}`; params.push(jobType);
  }

  const result = await query(
    `SELECT job_type, COALESCE(SUM(revenue_projected),0) as total_projected, COALESCE(SUM(revenue_produced),0) as total_produced, COUNT(*) as weeks_analyzed, AVG(revenue_projected) as avg_projected, AVG(revenue_produced) as avg_produced
     FROM metrics_snapshots WHERE 1=1 ${whereClause} GROUP BY job_type ORDER BY job_type`,
    params
  );

  const byType: { [key: string]: any } = {};
  let combinedProjected = 0, combinedProduced = 0;
  result.rows.forEach((row: any) => {
    const projected = parseFloat(row.total_projected || 0);
    const produced  = parseFloat(row.total_produced  || 0);
    byType[row.job_type] = { jobType: row.job_type, totalProjected: projected.toFixed(0), totalProduced: produced.toFixed(0), variance: (produced - projected).toFixed(0), weeksAnalyzed: parseInt(row.weeks_analyzed), avgProjected: parseFloat(row.avg_projected || 0).toFixed(0), avgProduced: parseFloat(row.avg_produced || 0).toFixed(0) };
    combinedProjected += projected; combinedProduced += produced;
  });

  res.json({ success: true, data: { byType, combined: { totalProjected: combinedProjected.toFixed(0), totalProduced: combinedProduced.toFixed(0), variance: (combinedProduced - combinedProjected).toFixed(0), accuracyPercent: combinedProjected > 0 ? ((combinedProduced / combinedProjected) * 100).toFixed(1) : '0' } } });
});

export const getCapacityAnalysis = asyncHandler(async (req: Request, res: Response) => {
  const { jobType, weeks = 4 } = req.query;
  if (!jobType) throw new AppError('jobType parameter is required', 400);
  if (!['shingle', 'metal'].includes(jobType as string)) throw new AppError('jobType must be either "shingle" or "metal"', 400);

  const numWeeks = parseInt(weeks as string);
  const result = await query(
    `SELECT job_type, AVG(CAST(capacity_utilization AS NUMERIC)) as avg_utilization, MAX(CAST(capacity_utilization AS NUMERIC)) as max_utilization, MIN(CAST(capacity_utilization AS NUMERIC)) as min_utilization, COUNT(CASE WHEN bottleneck_detected=true THEN 1 END) as bottleneck_weeks, COUNT(*) as total_weeks
     FROM metrics_snapshots WHERE job_type=$1 AND metric_week>=CURRENT_DATE-($2||' weeks')::interval GROUP BY job_type`,
    [jobType, numWeeks]
  );

  if (result.rows.length === 0) {
    return res.json({ success: true, data: { jobType, avgUtilization: 0, maxUtilization: 0, bottleneckWeeks: 0, totalWeeks: 0, recommendations: ['No capacity data available yet'] } });
  }
  const row = result.rows[0];
  const avgUtil = parseFloat(row.avg_utilization || 0);
  const bottleneckCount = parseInt(row.bottleneck_weeks);
  const totalWeeks = parseInt(row.total_weeks);
  const recommendations: string[] = [];
  if (avgUtil > 0.85) recommendations.push('Consider increasing crew capacity or adjusting production schedule');
  if (bottleneckCount > totalWeeks / 2) recommendations.push('Frequent bottlenecks detected - review crew sizing or production rates');
  if (avgUtil < 0.5) recommendations.push('Low utilization - consider optimizing crew allocation or sales strategy');
  if (recommendations.length === 0) recommendations.push('Capacity utilization is healthy');

  res.json({ success: true, data: { jobType: row.job_type, avgUtilization: (avgUtil * 100).toFixed(1), maxUtilization: (parseFloat(row.max_utilization || 0) * 100).toFixed(1), minUtilization: (parseFloat(row.min_utilization || 0) * 100).toFixed(1), bottleneckWeeks: bottleneckCount, totalWeeks, bottleneckPercentage: ((bottleneckCount / totalWeeks) * 100).toFixed(1), recommendations } });
});
