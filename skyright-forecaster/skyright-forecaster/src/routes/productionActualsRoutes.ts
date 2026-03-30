import express from 'express';
import {
  createProductionActual,
  getProductionActuals,
  getProductionRate,
  updateProductionActual
} from '../controllers/productionActualsController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getProductionActuals);
router.get('/rate', getProductionRate);
router.post('/', createProductionActual);
router.put('/:id', updateProductionActual);

export default router;
