import { Router } from 'express';
import {
  initiateOAuth,
  handleOAuthCallback,
  syncJobs,
  getHubSpotStatus,
} from '../controllers/hubspotController';
import { authenticateToken, authorize } from '../middleware/auth';

const router = Router();

// Public endpoint for OAuth callback
router.get('/callback', handleOAuthCallback);

// Get OAuth URL (no auth required to initiate)
router.get('/auth-url', initiateOAuth);

// Authenticated endpoints
router.use(authenticateToken);

router.get('/status', getHubSpotStatus);
router.post('/sync', authorize('admin', 'manager'), syncJobs);

export default router;
