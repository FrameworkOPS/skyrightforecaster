import { Router } from 'express';
import {
  generateForecast,
  getForecast,
  getForecastHistory,
  getForecastInsights,
  exportForecastPDF,
} from '../controllers/forecastController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// All forecast routes require authentication
router.use(authenticateToken);

router.post('/', authorize('admin', 'manager', 'scheduler'), generateForecast);
router.get('/history', getForecastHistory);
router.get('/:id/export', exportForecastPDF);
router.get('/:id/insights', getForecastInsights);
router.get('/:id', getForecast);

export default router;
