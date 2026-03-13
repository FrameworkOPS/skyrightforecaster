import { Request, Response } from 'express';
import { query } from '../config/database';
import { AppError, asyncHandler } from '../middleware/errorHandler';

export const getCrewStaff = asyncHandler(async (req: Request, res: Response) => {
  const { crewId } = req.params;

  if (!crewId) {
    throw new AppError('Missing required parameter: crewId', 400);
  }

  // Verify crew exists
  const crew = await query(
    'SELECT * FROM crews WHERE id = $1',
    [crewId]
  );

  if (crew.rows.length === 0) {
    throw new AppError('Crew not found', 404);
  }

  // Get current staff
  const staff = await query(
    'SELECT * FROM crew_staff WHERE crew_id = $1 AND is_active = true ORDER BY added_date DESC LIMIT 1',
    [crewId]
  );

  if (staff.rows.length === 0) {
    // Return crew info with default staff (0 leads, 0 supers)
    return res.json({
      success: true,
      data: {
        crew_id: crewId,
        crew_name: crew.rows[0].crew_name,
        crew_type: crew.rows[0].crew_type,
        team_members: crew.rows[0].team_members,
        lead_count: 0,
        super_count: 0,
        added_date: new Date().toISOString().split('T')[0],
        notes: null
      }
    });
  }

  res.json({
    success: true,
    data: {
      ...staff.rows[0],
      crew_name: crew.rows[0].crew_name,
      crew_type: crew.rows[0].crew_type,
      team_members: crew.rows[0].team_members
    }
  });
});

export const createCrewStaff = asyncHandler(async (req: Request, res: Response) => {
  const { crewId, leadCount, superCount, addedDate, notes } = req.body;

  // Validate required fields
  if (!crewId || !addedDate || leadCount === undefined || superCount === undefined) {
    throw new AppError('Missing required fields: crewId, addedDate, leadCount, superCount', 400);
  }

  // Verify crew exists
  const crew = await query(
    'SELECT * FROM crews WHERE id = $1',
    [crewId]
  );

  if (crew.rows.length === 0) {
    throw new AppError('Crew not found', 404);
  }

  // Set previous staff records to inactive
  await query(
    'UPDATE crew_staff SET is_active = false WHERE crew_id = $1',
    [crewId]
  );

  // Create new staff record
  const result = await query(
    `INSERT INTO crew_staff (crew_id, lead_count, super_count, added_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [crewId, leadCount, superCount, addedDate, notes || null, req.user?.id || null]
  );

  res.status(201).json({
    success: true,
    data: {
      ...result.rows[0],
      crew_name: crew.rows[0].crew_name,
      crew_type: crew.rows[0].crew_type,
      team_members: crew.rows[0].team_members
    },
    message: 'Crew staff record created successfully'
  });
});

export const updateCrewStaff = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { leadCount, superCount, notes } = req.body;

  // Check if staff record exists
  const existing = await query(
    'SELECT * FROM crew_staff WHERE id = $1',
    [id]
  );

  if (existing.rows.length === 0) {
    throw new AppError('Crew staff record not found', 404);
  }

  // Get crew info for response
  const crew = await query(
    'SELECT * FROM crews WHERE id = $1',
    [existing.rows[0].crew_id]
  );

  // Build update query dynamically
  const updates: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (leadCount !== undefined) {
    updates.push(`lead_count = $${paramCount}`);
    values.push(leadCount);
    paramCount++;
  }

  if (superCount !== undefined) {
    updates.push(`super_count = $${paramCount}`);
    values.push(superCount);
    paramCount++;
  }

  if (notes !== undefined) {
    updates.push(`notes = $${paramCount}`);
    values.push(notes);
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
    `UPDATE crew_staff SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
    values
  );

  res.json({
    success: true,
    data: {
      ...result.rows[0],
      crew_name: crew.rows[0].crew_name,
      crew_type: crew.rows[0].crew_type,
      team_members: crew.rows[0].team_members
    },
    message: 'Crew staff record updated successfully'
  });
});

export const getCrewStaffHistory = asyncHandler(async (req: Request, res: Response) => {
  const { crewId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  if (!crewId) {
    throw new AppError('Missing required parameter: crewId', 400);
  }

  // Verify crew exists
  const crew = await query(
    'SELECT * FROM crews WHERE id = $1',
    [crewId]
  );

  if (crew.rows.length === 0) {
    throw new AppError('Crew not found', 404);
  }

  const offset = ((parseInt(page as string) || 1) - 1) * parseInt(limit as string);

  const result = await query(
    `SELECT * FROM crew_staff WHERE crew_id = $1 ORDER BY added_date DESC LIMIT $2 OFFSET $3`,
    [crewId, limit, offset]
  );

  const countResult = await query(
    'SELECT COUNT(*) as total FROM crew_staff WHERE crew_id = $1',
    [crewId]
  );

  const data = result.rows.map((row: any) => ({
    ...row,
    crew_name: crew.rows[0].crew_name,
    crew_type: crew.rows[0].crew_type,
    team_members: crew.rows[0].team_members
  }));

  res.json({
    success: true,
    data,
    pagination: {
      total: parseInt(countResult.rows[0].total),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      pages: Math.ceil(parseInt(countResult.rows[0].total) / parseInt(limit as string))
    }
  });
});

export const getAllCrewsStaffSummary = asyncHandler(async (req: Request, res: Response) => {
  const { activeOnly = true } = req.query;

  let whereClause = 'WHERE c.is_active = true';
  if (activeOnly !== 'true') {
    whereClause = '';
  }

  const result = await query(
    `SELECT
       c.id,
       c.crew_name,
       c.crew_type,
       c.team_members,
       COALESCE(cs.lead_count, 0) as lead_count,
       COALESCE(cs.super_count, 0) as super_count,
       cs.added_date,
       cs.notes
     FROM crews c
     LEFT JOIN crew_staff cs ON c.id = cs.crew_id AND cs.is_active = true
     ${whereClause}
     ORDER BY c.crew_name`,
    []
  );

  res.json({
    success: true,
    data: result.rows
  });
});
