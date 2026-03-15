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

// Protected routes (require authentication)
router.post('/', authenticateToken, createOrUpdateSalesForecast);
router.post('/copy-week', authenticateToken, copyPreviousWeek);

export default router;
