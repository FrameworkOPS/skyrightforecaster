import express from 'express';
import {
  getCrewStaff,
  createCrewStaff,
  updateCrewStaff,
  getCrewStaffHistory,
  getAllCrewsStaffSummary
} from '../controllers/crewStaffController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getAllCrewsStaffSummary);
router.get('/crew/:crewId', getCrewStaff);
router.get('/crew/:crewId/history', getCrewStaffHistory);
router.post('/', createCrewStaff);
router.put('/:id', updateCrewStaff);

export default router;
