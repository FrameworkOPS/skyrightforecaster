import { Request, Response } from 'express';
import { query } from '../config/database';
import HubSpotService, { RoofingSquaresSummary } from '../services/hubspotService';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { getUUID } from '../utils/uuid';
import { CLOSING_RATE, REVENUE_PER_SQ } from '../constants/businessConstants';

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

  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

  if (!accessToken) {
    throw new AppError('HUBSPOT_ACCESS_TOKEN not configured on server', 500);
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
  const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;

  // Configured if we have either OAuth credentials (clientId + clientSecret) or a PAT (accessToken)
  const isConfigured = !!(accessToken || (clientId && clientSecret));

  let message = 'HubSpot integration not configured. Please set HUBSPOT_ACCESS_TOKEN or HUBSPOT_CLIENT_ID + HUBSPOT_CLIENT_SECRET';
  if (accessToken && clientSecret) {
    message = 'HubSpot integration configured (Private Access Token + Client Secret)';
  } else if (accessToken) {
    message = 'HubSpot integration configured (Private Access Token)';
  } else if (clientId && clientSecret) {
    message = 'HubSpot integration configured (OAuth)';
  }

  res.json({
    success: true,
    data: {
      configured: isConfigured,
      message,
    },
  });
});

/**
 * GET /api/hubspot/debug
 * Diagnostic endpoint — tests the token and both search APIs, returns raw
 * HubSpot response or the exact error so it's easy to see what's failing.
 */
export const debugHubSpot = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw new AppError('User not authenticated', 401);

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return res.json({ ok: false, error: 'HUBSPOT_ACCESS_TOKEN not set in environment' });
  }

  const hubspotService = new HubSpotService(token);
  const results: Record<string, any> = { token_present: true };

  // Test deals search
  try {
    const deals = await hubspotService.fetchPendingJobs(5);
    results.deals = { ok: true, count: deals.length, sample: deals[0]?.properties ?? null };
  } catch (e: any) {
    results.deals = {
      ok: false,
      status: e?.response?.status,
      error: e?.response?.data?.message || e?.response?.data?.error || e?.message,
      body: e?.response?.data,
    };
  }

  // Test tickets search
  try {
    const tickets = await hubspotService.fetchProductionTickets();
    results.tickets = { ok: true, count: tickets.length, sample: tickets[0]?.properties ?? null };
  } catch (e: any) {
    results.tickets = {
      ok: false,
      status: e?.response?.status,
      error: e?.response?.data?.message || e?.response?.data?.error || e?.message,
      body: e?.response?.data,
    };
  }

  return res.json(results);
});

export const getPipelineSummary = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw new AppError('User not authenticated', 401);
  }

  const hubspotAccessToken = process.env.HUBSPOT_ACCESS_TOKEN;

  // A Private App Token (PAT) is all that is needed — HUBSPOT_CLIENT_ID is only
  // required for the OAuth flow and must NOT gate the live data path.
  if (!hubspotAccessToken) {
    throw new AppError('HUBSPOT_ACCESS_TOKEN is not configured on the server', 500);
  }

  try {
    const hubspotService = new HubSpotService(hubspotAccessToken);

    // Fetch Contract Sent deals and all production-stage tickets in parallel
    const [hubspotDeals, productionTickets] = await Promise.all([
      hubspotService.fetchPendingJobs(50),
      hubspotService.fetchProductionTickets(),
    ]);

    // Map deals — only include "Shingles Roof" and "Metal Roof" job types.
    // All other types are excluded here as a belt-and-suspenders guard
    // (the HubSpot search filter already restricts to these two values).
    const deals = hubspotDeals
      .map((deal: any) => {
        const rawJobType: string = deal.properties?.job_type || '';

        // Exact HubSpot property values → internal type key
        const jobType: 'metal' | 'shingle' | null =
          rawJobType === 'Metal Roof'    ? 'metal'  :
          rawJobType === 'Shingles Roof' ? 'shingle' :
          null;

        if (jobType === null) return null; // ignore unrecognised types

        const amount = deal.properties?.amount ? parseFloat(deal.properties.amount) : 0;
        const dateEnteredContractSent: string | null =
          deal.properties?.hs_v2_date_entered_60609659 ?? null;

        // Use actual roof_squares from HubSpot when sales has entered it;
        // fall back to 30 SQs per roof until that field is populated.
        const DEFAULT_SQS = 30;
        const roofSqs = deal.properties?.roof_squares
          ? parseFloat(deal.properties.roof_squares)
          : DEFAULT_SQS;

        return {
          hubspot_id: deal.id,
          dealname: deal.properties?.dealname || 'Unnamed Deal',
          amount,
          job_type: jobType,
          date_entered_contract_sent: dateEnteredContractSent,
          roof_sqs: roofSqs,
          using_default_sqs: !deal.properties?.roof_squares,
          weighted_value: amount * CLOSING_RATE,
          estimated_sqs: roofSqs * CLOSING_RATE,
        };
      })
      .filter((d: any) => d !== null);

    const totalWeightedValue = deals.reduce((sum: number, d: any) => sum + d.weighted_value, 0);
    const totalWeightedSqs = deals.reduce((sum: number, d: any) => sum + d.estimated_sqs, 0);

    const roofingSquares: RoofingSquaresSummary = hubspotService.aggregateRoofingSquares(productionTickets);

    return res.json({
      success: true,
      data: {
        deals,
        totalWeightedValue,
        totalWeightedSqs,
        roofingSquares,
        message: 'HubSpot pipeline summary (live data)',
        source: 'HubSpot API',
      },
    });
  } catch (error: any) {
    // Surface the real HubSpot error — status, message, and response body — so
    // it's visible in Railway logs and returned to the client for debugging.
    const status   = error?.response?.status;
    const hsMsg    = error?.response?.data?.message || error?.response?.data?.error;
    const detail   = hsMsg
      ? `HubSpot ${status}: ${hsMsg}`
      : error?.message || 'Unknown error calling HubSpot API';

    console.error('[HubSpot] getPipelineSummary failed:', detail, error?.response?.data);
    throw new AppError(`HubSpot API error — ${detail}`, 502);
  }
});
