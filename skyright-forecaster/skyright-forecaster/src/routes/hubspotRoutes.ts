import { Router } from 'express';
import {
  initiateOAuth,
  handleOAuthCallback,
  syncJobs,
  getHubSpotStatus,
  getPipelineSummary,
  debugHubSpot,
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
router.get('/debug', debugHubSpot);
router.get('/pipeline-summary', getPipelineSummary);
router.post('/sync', syncJobs);

export default router;
