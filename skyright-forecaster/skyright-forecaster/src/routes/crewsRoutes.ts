import { Router, Request, Response, NextFunction } from 'express';
import {
  getCrews,
  getCrew,
  createCrew,
  updateCrew,
  deleteCrew,
} from '../controllers/crewsController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/crews
 * Get all crews (optionally filtered by active status)
 * Query params: active=true|false
 */
router.get('/', getCrews);

/**
 * GET /api/crews/:id
 * Get a specific crew by ID
 */
router.get('/:id', getCrew);

/**
 * POST /api/crews
 * Create a new crew (requires admin or manager role)
 */
router.post('/', authorize('admin', 'manager'), createCrew);

/**
 * PUT /api/crews/:id
 * Update a crew (requires admin or manager role)
 */
router.put('/:id', authorize('admin', 'manager'), updateCrew);

/**
 * DELETE /api/crews/:id
 * Delete (soft delete) a crew (requires admin role)
 */
router.delete('/:id', authorize('admin'), deleteCrew);

export default router;
