import { Router } from 'express';
import { getJobs, createJob, updateJobStatus, deleteJob, uploadJobsCSV } from '../controllers/jobsController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// All job routes require authentication
router.use(authenticateToken);

router.get('/', getJobs);
router.post('/', authorize('admin', 'manager', 'scheduler'), createJob);
router.put('/:id/status', authorize('admin', 'manager', 'scheduler'), updateJobStatus);
router.delete('/:id', authorize('admin'), deleteJob);
router.post('/upload-csv', authorize('admin', 'manager'), uploadJobsCSV);

export default router;
