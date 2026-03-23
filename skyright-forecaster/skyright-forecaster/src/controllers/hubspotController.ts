import { Request, Response } from 'express';
import { query } from '../config/database';
import HubSpotService from '../services/hubspotService';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { getUUID } from '../utils/uuid';
import { CLOSING_RATE, CREW_TYPE_RATIOS, REVENUE_PER_SQ } from '../constants/businessConstants';

export const initiateOAuth = asyncHandler(async (req: Request, res: Response) => {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new AppError('HubSpot credentials not configured', 500);
  }

  const hubspotService = new HubSpotService();
  const authUrl = hubspotService.getAuthorizationUrl(clientId, redirectUri);

  res.json({
    success: true,
    message: 'Redirect user to this URL to authorize HubSpot access',
    authUrl,
  });
});

export const handleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  const { code } = req.query;

  if (!code || typeof code !== 'string') {
    throw new AppError('Authorization code not provided', 400);
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError('HubSpot credentials not configured', 500);
  }

  try {
    const hubspotService = new HubSpotService();
    const accessToken = await hubspotService.exchangeCodeForToken(
      clientId,
      clientSecret,
      code,
      redirectUri
    );

    // Store access token securely (in production, use encrypted storage)
    // For now, store in environment or database
    res.json({
      success: true,
      message: 'Successfully authenticated with HubSpot',
      accessToken,
      // In production, you'd want to securely store this token
      nextStep: 'Use this token in the sync endpoint or store it securely',
    });
  } catch (error) {
    throw new AppError('Failed to authenticate with HubSpot', 500);
  }
});

export const syncJobs = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  const { accessToken } = req.body;

  if (!accessToken) {
    throw new AppError('HubSpot access token required', 400);
  }

  try {
    const hubspotService = new HubSpotService(accessToken);
    const syncResult = await hubspotService.syncJobs(req.user.userId);

    // Log audit entry
    await query(
      `INSERT INTO audit_log (id, user_id, action, entity_type, new_values, timestamp)
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        await getUUID(),
        req.user.userId,
        'SYNC',
        'jobs',
        JSON.stringify(syncResult),
      ]
    );

    res.json({
      success: true,
      message: 'Jobs synchronized successfully',
      data: syncResult,
    });
  } catch (error) {
    throw new AppError('Failed to sync jobs from HubSpot', 500);
  }
});

export const getHubSpotStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  res.json({
    success: true,
    data: {
      configured: !!(clientId && clientSecret),
      message: clientId && clientSecret
        ? 'HubSpot integration configured'
        : 'HubSpot integration not configured. Please set HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET',
    },
  });
});

export const getPipelineSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  try {
    const clientId = process.env.HUBSPOT_CLIENT_ID;
    const hubspotAccessToken = process.env.HUBSPOT_ACCESS_TOKEN;

    // If HubSpot is configured, try to fetch real deals
    if (clientId && hubspotAccessToken) {
      try {
        const hubspotService = new HubSpotService(hubspotAccessToken);
        const hubspotDeals = await hubspotService.fetchPendingJobs(50);

        const deals = hubspotDeals.map((deal: any) => {
          const amount = deal.properties?.amount ? parseFloat(deal.properties.amount) : 0;
          const jobType = deal.properties?.dealstage?.includes('metal') ? 'metal' : 'shingle';

          return {
            hubspot_id: deal.id,
            dealname: deal.properties?.dealname || 'Unnamed Deal',
            amount,
            inferred_job_type: jobType,
            weighted_value: amount * CLOSING_RATE * (jobType === 'metal' ? CREW_TYPE_RATIOS.metal : CREW_TYPE_RATIOS.shingles),
            estimated_sqs: (amount * CLOSING_RATE * (jobType === 'metal' ? CREW_TYPE_RATIOS.metal : CREW_TYPE_RATIOS.shingles)) / (jobType === 'metal' ? REVENUE_PER_SQ.metal : REVENUE_PER_SQ.shingles),
          };
        });

        const totalWeightedValue = deals.reduce((sum: number, d: any) => sum + d.weighted_value, 0);
        const totalWeightedSqs = deals.reduce((sum: number, d: any) => sum + d.estimated_sqs, 0);

        return res.json({
          success: true,
          data: {
            deals,
            totalWeightedValue,
            totalWeightedSqs,
            message: 'HubSpot pipeline summary (live data)',
            source: 'HubSpot API',
          },
        });
      } catch (hubspotError) {
        console.error('Failed to fetch from HubSpot API, falling back to mock data:', hubspotError);
        // Fall through to mock data below
      }
    }

    // Return mock HubSpot deals if HubSpot service is not configured or API call failed
    const mockDeals = [
      {
        hubspot_id: 'deal-1',
        dealname: 'Commercial Roofing Project - Downtown',
        amount: 45000,
        inferred_job_type: 'shingle',
        weighted_value: 45000 * CLOSING_RATE * CREW_TYPE_RATIOS.shingles,
        estimated_sqs: (45000 * CLOSING_RATE * CREW_TYPE_RATIOS.shingles) / REVENUE_PER_SQ.shingles,
      },
      {
        hubspot_id: 'deal-2',
        dealname: 'Metal Roofing - Industrial Complex',
        amount: 75000,
        inferred_job_type: 'metal',
        weighted_value: 75000 * CLOSING_RATE * CREW_TYPE_RATIOS.metal,
        estimated_sqs: (75000 * CLOSING_RATE * CREW_TYPE_RATIOS.metal) / REVENUE_PER_SQ.metal,
      },
      {
        hubspot_id: 'deal-3',
        dealname: 'Residential Roof Replacement',
        amount: 28000,
        inferred_job_type: 'shingle',
        weighted_value: 28000 * CLOSING_RATE * CREW_TYPE_RATIOS.shingles,
        estimated_sqs: (28000 * CLOSING_RATE * CREW_TYPE_RATIOS.shingles) / REVENUE_PER_SQ.shingles,
      },
    ];

    const totalWeightedValue = mockDeals.reduce((sum, d) => sum + d.weighted_value, 0);
    const totalWeightedSqs = mockDeals.reduce((sum, d) => sum + d.estimated_sqs, 0);

    res.json({
      success: true,
      data: {
        deals: mockDeals,
        totalWeightedValue,
        totalWeightedSqs,
        message: 'HubSpot pipeline summary (mock data - configure real credentials to use live data)',
        source: 'Mock Data',
      },
    });
  } catch (error) {
    throw new AppError('Failed to fetch HubSpot pipeline', 500);
  }
});
