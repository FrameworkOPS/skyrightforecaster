import { Router } from 'express';
import {
  generateInsights,
  getInsights,
  askQuestion,
} from '../controllers/insightsController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// All insight routes require authentication
router.use(authenticateToken);

router.post('/generate', authorize('admin', 'manager', 'scheduler'), generateInsights);
router.get('/:forecastId', getInsights);
router.post('/ask', authorize('admin', 'manager', 'scheduler'), askQuestion);

export default router;
