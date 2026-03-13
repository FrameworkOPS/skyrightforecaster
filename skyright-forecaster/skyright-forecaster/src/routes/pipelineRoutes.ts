import express from 'express';
import {
  getPipelineItems,
  getPipelineItem,
  createPipelineItem,
  updatePipelineItem,
  deletePipelineItem,
  getPipelineSummary
} from '../controllers/pipelineController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = express.Router();

// Public routes (require authentication)
router.get('/', authenticateToken, getPipelineItems);
router.get('/summary', authenticateToken, getPipelineSummary);
router.get('/:id', authenticateToken, getPipelineItem);

// Protected routes (require admin/manager/scheduler)
router.post('/', authenticateToken, authorize('admin', 'manager', 'scheduler'), createPipelineItem);
router.put('/:id', authenticateToken, authorize('admin', 'manager', 'scheduler'), updatePipelineItem);
router.delete('/:id', authenticateToken, authorize('admin'), deletePipelineItem);

export default router;
