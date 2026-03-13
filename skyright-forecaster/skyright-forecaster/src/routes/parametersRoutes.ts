import { Router } from 'express';
import { getParameters, updateParameters, getParametersHistory } from '../controllers/parametersController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// All parameter routes require authentication
router.use(authenticateToken);

router.get('/', getParameters);
router.put('/', authorize('admin', 'manager'), updateParameters);
router.get('/history', authorize('admin', 'manager'), getParametersHistory);

export default router;
