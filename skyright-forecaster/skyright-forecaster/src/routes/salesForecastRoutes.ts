import express from 'express';
import {
  getSalesForecasts,
  getSalesForecast,
  createOrUpdateSalesForecast,
  copyPreviousWeek,
  getSalesForecastChartData
} from '../controllers/salesForecastController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = express.Router();

// Public routes (require authentication)
router.get('/', authenticateToken, getSalesForecasts);
router.get('/chart-data', authenticateToken, getSalesForecastChartData);
router.get('/:week/:jobType', authenticateToken, getSalesForecast);

// Protected routes (require admin/manager/scheduler)
router.post('/', authenticateToken, authorize('admin', 'manager', 'scheduler'), createOrUpdateSalesForecast);
router.post('/copy-week', authenticateToken, authorize('admin', 'manager', 'scheduler'), copyPreviousWeek);

export default router;
