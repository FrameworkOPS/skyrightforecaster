import { Router } from 'express';
import { getParameters, updateParameters, getParametersHistory } from '../controllers/parametersController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.use(authenticateToken);

router.get('/', getParameters);
router.put('/', updateParameters);
router.get('/history', getParametersHistory);

export default router;
