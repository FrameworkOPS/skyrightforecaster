import express from 'express';
import {
  getCrewStaff,
  createCrewStaff,
  updateCrewStaff,
  getCrewStaffHistory,
  getAllCrewsStaffSummary
} from '../controllers/crewStaffController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = express.Router();

// Public routes (require authentication)
router.get('/', authenticateToken, getAllCrewsStaffSummary);
router.get('/crew/:crewId', authenticateToken, getCrewStaff);
router.get('/crew/:crewId/history', authenticateToken, getCrewStaffHistory);

// Protected routes (require admin/manager)
router.post('/', authenticateToken, authorize('admin', 'manager'), createCrewStaff);
router.put('/:id', authenticateToken, authorize('admin', 'manager'), updateCrewStaff);

export default router;
