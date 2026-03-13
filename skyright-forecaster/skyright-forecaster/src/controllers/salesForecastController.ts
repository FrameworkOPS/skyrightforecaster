import { Request, Response } from 'express';
import { query } from '../config/database';
import { AppError, asyncHandler } from '../middleware/errorHandler';

export const getSalesForecasts = asyncHandler(async (req: Request, res: Response) => {
  const { startWeek, endWeek, jobType, page = 1, limit = 50 } = req.query;

  let whereConditions = [];
  const params: any[] = [];
  let paramCount = 1;

  if (startWeek) {
    whereConditions.push(`forecast_week >= $${paramCount}`);
    params.push(startWeek);
    paramCount++;
  }

  if (endWeek) {
    whereConditions.push(`forecast_week <= $${paramCount}`);
    params.push(endWeek);
    paramCount++;
  }

  if (jobType) {
    whereConditions.push(`job_type = $${paramCount}`);
    params.push(jobType);
    paramCount++;
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const offset = ((parseInt(page as string) || 1) - 1) * parseInt(limit as string);

  const result = await query(
    `SELECT * FROM sales_forecast ${whereClause} ORDER BY forecast_week ASC, job_type ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM sales_forecast ${whereClause}`,
    params
  );

  res.json({
    success: true,
    data: result.rows,
    pagination: {
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      pages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit as string))
    }
  });
});

export const getSalesForecast = asyncHandler(async (req: Request, res: Response) => {
  const { week, jobType } = req.params;

  if (!week || !jobType) {
    throw new AppError('Missing required parameters: week and jobType', 400);
  }

  const result = await query(
    'SELECT * FROM sales_forecast WHERE forecast_week = $1 AND job_type = $2',
    [week, jobType]
  );

  if (result.rows.length === 0) {
    // Return empty forecast structure if not found
    return res.json({
      success: true,
      data: {
        forecast_week: week,
        job_type: jobType,
        projected_square_footage: 0,
        projected_job_count: 0,
        notes: null,
        created_at: null
      }
    });
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
});

export const createOrUpdateSalesForecast = asyncHandler(async (req: Request, res: Response) => {
  const { forecastWeek, jobType, projectedSquareFootage, projectedJobCount, notes } = req.body;

  // Validate required fields
  if (!forecastWeek || !jobType || projectedSquareFootage === undefined) {
    throw new AppError('Missing required fields: forecastWeek, jobType, projectedSquareFootage', 400);
  }

  // Validate job type
  if (!['shingle', 'metal'].includes(jobType)) {
    throw new AppError('jobType must be either "shingle" or "metal"', 400);
  }

  // Try to insert, if it fails due to unique constraint, update
  try {
    const result = await query(
      `INSERT INTO sales_forecast (forecast_week, job_type, projected_square_footage, projected_job_count, notes, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (forecast_week, job_type) DO UPDATE
       SET projected_square_footage = $3, projected_job_count = $4, notes = $5, updated_by = $6, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [forecastWeek, jobType, projectedSquareFootage, projectedJobCount || 0, notes || null, req.user?.id || null]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Sales forecast created/updated successfully'
    });
  } catch (error) {
    throw error;
  }
});

export const copyPreviousWeek = asyncHandler(async (req: Request, res: Response) => {
  const { fromWeek, toWeek, jobType } = req.body;

  // Validate required fields
  if (!fromWeek || !toWeek || !jobType) {
    throw new AppError('Missing required fields: fromWeek, toWeek, jobType', 400);
  }

  // Validate job type
  if (!['shingle', 'metal'].includes(jobType)) {
    throw new AppError('jobType must be either "shingle" or "metal"', 400);
  }

  // Get the forecast from the source week
  const source = await query(
    'SELECT * FROM sales_forecast WHERE forecast_week = $1 AND job_type = $2',
    [fromWeek, jobType]
  );

  if (source.rows.length === 0) {
    throw new AppError(`No forecast found for week ${fromWeek} and job type ${jobType}`, 404);
  }

  const sourceData = source.rows[0];

  // Copy to the new week
  const result = await query(
    `INSERT INTO sales_forecast (forecast_week, job_type, projected_square_footage, projected_job_count, notes, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (forecast_week, job_type) DO UPDATE
     SET projected_square_footage = $3, projected_job_count = $4, notes = $5, updated_by = $6, updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [toWeek, jobType, sourceData.projected_square_footage, sourceData.projected_job_count, sourceData.notes, req.user?.id || null]
  );

  res.json({
    success: true,
    data: result.rows[0],
    message: `Forecast copied from week ${fromWeek} to ${toWeek} for ${jobType}`
  });
});

export const getSalesForecastChartData = asyncHandler(async (req: Request, res: Response) => {
  const { startWeek, endWeek } = req.query;

  let whereConditions = ['forecast_week IS NOT NULL'];
  const params: any[] = [];
  let paramCount = 1;

  if (startWeek) {
    whereConditions.push(`forecast_week >= $${paramCount}`);
    params.push(startWeek);
    paramCount++;
  }

  if (endWeek) {
    whereConditions.push(`forecast_week <= $${paramCount}`);
    params.push(endWeek);
    paramCount++;
  }

  const whereClause = whereConditions.join(' AND ');

  const result = await query(
    `SELECT
       forecast_week,
       job_type,
       projected_square_footage
     FROM sales_forecast
     WHERE ${whereClause}
     ORDER BY forecast_week ASC, job_type ASC`,
    params
  );

  // Transform data for chart
  const weeks = new Set<string>();
  const dataByType: { [key: string]: { [week: string]: number } } = {
    shingle: {},
    metal: {}
  };

  result.rows.forEach((row: any) => {
    weeks.add(row.forecast_week);
    dataByType[row.job_type][row.forecast_week] = parseFloat(row.projected_square_footage);
  });

  const sortedWeeks = Array.from(weeks).sort();

  const chartData = sortedWeeks.map((week: string) => ({
    week,
    shingleSQs: dataByType.shingle[week] || 0,
    metalSQs: dataByType.metal[week] || 0,
    combinedSQs: (dataByType.shingle[week] || 0) + (dataByType.metal[week] || 0)
  }));

  res.json({
    success: true,
    data: chartData
  });
});
