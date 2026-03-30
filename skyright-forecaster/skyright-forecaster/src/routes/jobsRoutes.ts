import { Router } from 'express';
import { getJobs, createJob, updateJobStatus, deleteJob, uploadJobsCSV } from '../controllers/jobsController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', getJobs);
router.post('/', createJob);
router.put('/:id/status', updateJobStatus);
router.delete('/:id', deleteJob);
router.post('/upload-csv', uploadJobsCSV);

export default router;
