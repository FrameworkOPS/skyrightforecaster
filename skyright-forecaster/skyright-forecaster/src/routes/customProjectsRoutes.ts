import { Router } from 'express';
import {
  getCustomProjects,
  getCustomProject,
  createCustomProject,
  updateCustomProject,
  deleteCustomProject,
} from '../controllers/customProjectsController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /api/custom-projects
 * Get all custom projects (optionally filtered by crew_id or active status)
 * Query params: crew_id=<uuid>, active=true|false
 */
router.get('/', getCustomProjects);

/**
 * GET /api/custom-projects/:id
 * Get a specific custom project by ID
 */
router.get('/:id', getCustomProject);

/**
 * POST /api/custom-projects
 * Create a new custom project (requires authentication)
 */
router.post('/', createCustomProject);

/**
 * PUT /api/custom-projects/:id
 * Update a custom project (requires authentication)
 */
router.put('/:id', updateCustomProject);

/**
 * DELETE /api/custom-projects/:id
 * Delete a custom project (requires authentication)
 */
router.delete('/:id', deleteCustomProject);

export default router;
