# HubSpot Integration Setup Guide

## Overview

The Skyright Production Forecaster can integrate with HubSpot to automatically pull pipeline deals and use them for production forecasting. This guide explains how to set up HubSpot OAuth authentication and data synchronization.

## Current Status

- ✅ Backend HubSpot service implemented (OAuth, API calls, data sync)
- ✅ Frontend HubSpot pipeline display with weighted calculations
- ✅ Database schema ready to store HubSpot deals
- ⏳ **Next Step**: Configure HubSpot OAuth credentials

## What's Already Built

### Backend Features
- **HubSpot OAuth Flow**: Complete OAuth 2.0 implementation for authentication
- **Deal Fetching**: Automatic fetching of pending/qualified HubSpot deals
- **Data Sync**: Endpoint to sync HubSpot jobs to the database
- **Pipeline Summary**: API endpoint that returns HubSpot deals with weighted calculations
  - Applies 40% closing rate
  - Applies crew type ratios (30% metal, 70% shingles)
  - Calculates estimated SQs based on revenue pricing

### Frontend Features
- **HubSpot Setup Tab**: New dashboard tab with step-by-step setup instructions
- **Pipeline Display**: Shows HubSpot deals with weighted values and SQ estimates
- **Job Type Assignment**: Allows manual assignment of job types to deals

### Database Tables
- `jobs`: Stores synced HubSpot jobs with full details
- `pipeline_items`: Alternative storage for pipeline data
- All metrics calculated from HubSpot data

## Setup Instructions

### Step 1: Create HubSpot Private App

1. Log into HubSpot Account
2. Go to **Settings** (gear icon) → **Integrations** → **Private Apps**
3. Click **Create App**
4. Fill in App Name: "Skyright Forecaster"
5. Go to **Scopes** tab and add these permissions:
   - `crm.objects.deals.read`
   - `crm.objects.contacts.read`
   - `crm.objects.companies.read`
6. Go to **Auth** tab and copy:
   - **Client ID**
   - **Client Secret**
7. Save and Install App

### Step 2: Configure Environment Variables

In your backend `.env` file, add:

```bash
HUBSPOT_CLIENT_ID=your_client_id_from_step1
HUBSPOT_CLIENT_SECRET=your_client_secret_from_step1
HUBSPOT_REDIRECT_URI=http://localhost:5000/api/hubspot/callback
```

For production deployment (e.g., Vercel), update the redirect URI to your production URL:
```
https://your-production-domain.com/api/hubspot/callback
```

### Step 3: Add Redirect URI to HubSpot App

1. In HubSpot, go back to your Private App settings
2. Go to **Auth** tab
3. Add this to "Authorized redirect URLs":
   ```
   http://localhost:5000/api/hubspot/callback
   ```
   (or your production URL)
4. Save changes

### Step 4: (Optional) Get Access Token

The app can also use a stored access token for direct API access:

```bash
HUBSPOT_ACCESS_TOKEN=your_access_token_here
```

You can get this by:
1. Going through the OAuth flow in the app (HubSpot Setup tab → "Authorize with HubSpot" button)
2. Or extracting from your HubSpot app's token page

### Step 5: Deploy & Test

1. Restart your backend server (so it picks up the new env vars)
2. Open the app and navigate to **HubSpot Setup** tab
3. Click **Refresh Status** - should now show "HubSpot Integration Active"
4. Navigate to **Sales Forecast** tab - HubSpot deals should appear in the pipeline display
5. Data shows:
   - Deal name and amount
   - Inferred job type
   - Weighted value (with closing rate applied)
   - Estimated SQs

## How It Works

### Data Flow

1. **OAuth Authorization**
   - User clicks "Authorize with HubSpot"
   - Redirected to HubSpot login
   - Grants permission to access deals
   - Token returned to backend

2. **Deal Fetching**
   - When user views Sales Forecast
   - Backend fetches pending deals from HubSpot API
   - Applies business logic:
     - 40% closing rate
     - Crew type ratios (30% metal, 70% shingles)
     - Revenue per SQ ($600 shingles, $1000 metal)

3. **Data Storage** (Optional)
   - Can sync deals to database using `/api/hubspot/sync` endpoint
   - Stores full job details for historical tracking
   - Allows offline forecasting without constant API calls

### Calculations

For each HubSpot deal:
```
weighted_value = deal_amount × CLOSING_RATE × CREW_TYPE_RATIO
estimated_sqs = weighted_value / REVENUE_PER_SQ

Example (Shingles deal):
- Deal amount: $45,000
- Closing rate: 40% = $18,000
- Crew ratio: 70% = $12,600
- Revenue per SQ: $600
- Estimated SQs: $12,600 / $600 = 21 SQs
```

## API Endpoints

### Check HubSpot Status
```
GET /api/hubspot/status
```
Returns: `{ configured: boolean, message: string }`

### Get Pipeline Summary
```
GET /api/hubspot/pipeline-summary
```
Returns: Array of deals with weighted values and estimated SQs

### Initiate OAuth
```
GET /api/hubspot/auth
```
Returns: `{ authUrl: string }` - redirect user to this URL

### Handle OAuth Callback
```
GET /api/hubspot/callback?code=authorization_code
```
Auto-handled by backend, returns access token

### Sync Jobs from HubSpot
```
POST /api/hubspot/sync
Body: { accessToken: string }
```
Syncs all HubSpot deals to database

## Troubleshooting

### "HubSpot integration not configured"
- Check that HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET are set in `.env`
- Restart backend server after adding env vars
- Verify no typos in credentials

### "Failed to fetch HubSpot pipeline"
- Check that HUBSPOT_ACCESS_TOKEN is valid (not expired)
- Verify HubSpot private app has `crm.objects.deals.read` scope
- Check network requests in browser console for detailed error

### No deals showing in Sales Forecast
- Ensure you have deals in "Qualified to Buy", "Presentation Scheduled", or "Proposal Submitted" stages
- Other stages are filtered out by the API
- Check HubSpot UI to confirm deals exist in those stages

### Redirect URI mismatch error
- Verify the redirect URI in HubSpot Private App matches the one in `.env`
- For production, ensure HUBSPOT_REDIRECT_URI points to production domain
- HubSpot requires exact match

## Production Considerations

1. **Environment Variables**: Use Vercel/deployment platform's secrets manager, not `.env` files
2. **Token Storage**: Store access tokens securely (database with encryption recommended)
3. **API Rate Limits**: HubSpot has rate limits (100 calls per 10 seconds)
4. **Token Refresh**: Implement token refresh logic if using long-term tokens
5. **HTTPS**: Ensure production domain uses HTTPS for OAuth security

## Next Steps

1. Create HubSpot Private App (follow Step 1-3 above)
2. Add credentials to `.env` file
3. Restart backend
4. Visit HubSpot Setup tab and verify "Integration Active"
5. Add HubSpot deals to your Sales Forecast pipeline
6. The forecaster will automatically weight them at 40% closing rate

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Check backend logs for detailed errors
3. Verify all environment variables are set
4. Ensure HubSpot private app has correct scopes and redirect URI
