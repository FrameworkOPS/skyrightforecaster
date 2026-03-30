import express from 'express';
import {
  getPipelineItems,
  getPipelineItem,
  createPipelineItem,
  updatePipelineItem,
  deletePipelineItem,
  getPipelineSummary
} from '../controllers/pipelineController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getPipelineItems);
router.get('/summary', getPipelineSummary);
router.get('/:id', getPipelineItem);
router.post('/', createPipelineItem);
router.put('/:id', updatePipelineItem);
router.delete('/:id', deletePipelineItem);

export default router;
