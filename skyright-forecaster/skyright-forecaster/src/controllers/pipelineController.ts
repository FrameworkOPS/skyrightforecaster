import { Request, Response } from 'express';
import { query } from '../config/database';
import { AppError, asyncHandler } from '../middleware/errorHandler';

export const getPipelineItems = asyncHandler(async (req: Request, res: Response) => {
  const { jobType, status, activeOnly = true, page = 1, limit = 50 } = req.query;

  let whereConditions = [];
  const params: any[] = [];
  let paramCount = 1;

  if (activeOnly === 'true') {
    whereConditions.push(`is_active = true`);
  }

  if (jobType) {
    whereConditions.push(`job_type = $${paramCount}`);
    params.push(jobType);
    paramCount++;
  }

  if (status) {
    whereConditions.push(`status = $${paramCount}`);
    params.push(status);
    paramCount++;
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
  const offset = ((parseInt(page as string) || 1) - 1) * parseInt(limit as string);

  const result = await query(
    `SELECT * FROM pipeline_items ${whereClause} ORDER BY added_date DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`,
    [...params, limit, offset]
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM pipeline_items ${whereClause}`,
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

export const getPipelineItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const result = await query(
    'SELECT * FROM pipeline_items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Pipeline item not found', 404);
  }

  res.json({
    success: true,
    data: result.rows[0]
  });
});

export const createPipelineItem = asyncHandler(async (req: Request, res: Response) => {
  const {
    jobType,
    squareFootage,
    estimatedDaysToCompletion,
    revenuePerSq,
    status = 'pending',
    addedDate,
    targetStartDate,
    notes
  } = req.body;

  // Validate required fields
  if (!jobType || !squareFootage || !estimatedDaysToCompletion || !revenuePerSq || !addedDate) {
    throw new AppError('Missing required fields: jobType, squareFootage, estimatedDaysToCompletion, revenuePerSq, addedDate', 400);
  }

  // Validate job type
  if (!['shingle', 'metal'].includes(jobType)) {
    throw new AppError('jobType must be either "shingle" or "metal"', 400);
  }

  const totalRevenue = squareFootage * revenuePerSq;

  const result = await query(
    `INSERT INTO pipeline_items (job_type, square_footage, estimated_days_to_completion, revenue_per_sq, total_revenue, status, added_date, target_start_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [jobType, squareFootage, estimatedDaysToCompletion, revenuePerSq, totalRevenue, status, addedDate, targetStartDate || null, notes || null, req.user?.id || null]
  );

  res.status(201).json({
    success: true,
    data: result.rows[0],
    message: 'Pipeline item created successfully'
  });
});

export const updatePipelineItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    jobType,
    squareFootage,
    estimatedDaysToCompletion,
    revenuePerSq,
    status,
    addedDate,
    targetStartDate,
    notes,
    isActive
  } = req.body;

  // Check if item exists
  const existing = await query(
    'SELECT * FROM pipeline_items WHERE id = $1',
    [id]
  );

  if (existing.rows.length === 0) {
    throw new AppError('Pipeline item not found', 404);
  }

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (jobType !== undefined) {
    if (!['shingle', 'metal'].includes(jobType)) {
      throw new AppError('jobType must be either "shingle" or "metal"', 400);
    }
    updates.push(`job_type = $${paramCount}`);
    values.push(jobType);
    paramCount++;
  }

  if (squareFootage !== undefined) {
    updates.push(`square_footage = $${paramCount}`);
    values.push(squareFootage);
    paramCount++;
  }

  if (estimatedDaysToCompletion !== undefined) {
    updates.push(`estimated_days_to_completion = $${paramCount}`);
    values.push(estimatedDaysToCompletion);
    paramCount++;
  }

  if (revenuePerSq !== undefined) {
    updates.push(`revenue_per_sq = $${paramCount}`);
    values.push(revenuePerSq);
    paramCount++;
  }

  if (status !== undefined) {
    updates.push(`status = $${paramCount}`);
    values.push(status);
    paramCount++;
  }

  if (addedDate !== undefined) {
    updates.push(`added_date = $${paramCount}`);
    values.push(addedDate);
    paramCount++;
  }

  if (targetStartDate !== undefined) {
    updates.push(`target_start_date = $${paramCount}`);
    values.push(targetStartDate);
    paramCount++;
  }

  if (notes !== undefined) {
    updates.push(`notes = $${paramCount}`);
    values.push(notes);
    paramCount++;
  }

  if (isActive !== undefined) {
    updates.push(`is_active = $${paramCount}`);
    values.push(isActive);
    paramCount++;
  }

  // Recalculate total revenue if needed
  if (squareFootage !== undefined || revenuePerSq !== undefined) {
    const final_sq = squareFootage ?? existing.rows[0].square_footage;
    const final_rev = revenuePerSq ?? existing.rows[0].revenue_per_sq;
    updates.push(`total_revenue = $${paramCount}`);
    values.push(final_sq * final_rev);
    paramCount++;
  }

  updates.push(`updated_at = CURRENT_TIMESTAMP`);

  if (updates.length === 1) {
    // Only updated_at was added
    return res.json({
      success: true,
      data: existing.rows[0],
      message: 'No changes to apply'
    });
  }

  values.push(id);

  const result = await query(
    `UPDATE pipeline_items SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  res.json({
    success: true,
    data: result.rows[0],
    message: 'Pipeline item updated successfully'
  });
});

export const deletePipelineItem = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Soft delete by setting is_active to false
  const result = await query(
    'UPDATE pipeline_items SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
    [id]
  );

  if (result.rows.length === 0) {
    throw new AppError('Pipeline item not found', 404);
  }

  res.json({
    success: true,
    data: result.rows[0],
    message: 'Pipeline item deleted successfully'
  });
});

export const getPipelineSummary = asyncHandler(async (req: Request, res: Response) => {
  const { jobType } = req.query;

  let whereClause = 'WHERE is_active = true';
  const params: any[] = [];

  if (jobType) {
    whereClause += ' AND job_type = $1';
    params.push(jobType);
  }

  const result = await query(
    `SELECT
       job_type,
       COUNT(*) as job_count,
       SUM(square_footage) as total_sqs,
       SUM(total_revenue) as total_revenue,
       AVG(estimated_days_to_completion) as avg_duration_days,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
       COUNT(CASE WHEN status = 'in_queue' THEN 1 END) as in_queue_count,
       COUNT(CASE WHEN status = 'in_progress' THEN 1 END) as in_progress_count
     FROM pipeline_items
     ${whereClause}
     GROUP BY job_type
     ORDER BY job_type`,
    params
  );

  // Calculate combined totals
  const combined = {
    job_count: 0,
    total_sqs: 0,
    total_revenue: 0,
    avg_duration_days: 0
  };

  result.rows.forEach((row: any) => {
    combined.job_count += parseInt(row.job_count);
    combined.total_sqs += parseFloat(row.total_sqs || 0);
    combined.total_revenue += parseFloat(row.total_revenue || 0);
  });

  if (result.rows.length > 0) {
    combined.avg_duration_days = result.rows.reduce((sum: number, row: any) =>
      sum + parseFloat(row.avg_duration_days || 0), 0) / result.rows.length;
  }

  res.json({
    success: true,
    data: {
      byType: result.rows,
      combined
    }
  });
});
