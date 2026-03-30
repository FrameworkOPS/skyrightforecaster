import express from 'express';
import {
  calculateWeeklyMetrics,
  getMetricsDashboardData,
  getLeadTimeAnalysis,
  getRevenueAnalysis,
  getCapacityAnalysis
} from '../controllers/metricsController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);

router.get('/dashboard', getMetricsDashboardData);
router.get('/lead-time-analysis', getLeadTimeAnalysis);
router.get('/revenue-analysis', getRevenueAnalysis);
router.get('/capacity-analysis', getCapacityAnalysis);
router.post('/calculate', calculateWeeklyMetrics);

export default router;
