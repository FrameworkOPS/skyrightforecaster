import axios, { AxiosInstance } from 'axios';
import { query } from '../config/database';
import { getUUID } from '../utils/uuid';

interface HubSpotJob {
  id: string;
  properties: {
    [key: string]: any;
  };
}

interface HubSpotTicket {
  id: string;
  properties: {
    subject?: string;
    hs_pipeline_stage?: string;
    roof_squares?: string;
    job_type?: string;
    [key: string]: any;
  };
}

export interface RoofingSquaresSummary {
  metal: number;
  shingles: number;
}

interface JobMapping {
  jobId: string;
  installDate: string;
  estimatedDuration: number;
  crewSize: number;
  crewType?: string;       // maps to jobs.crew_type  — from HubSpot job_type property
  squareFootage?: number;  // maps to jobs.square_footage — from HubSpot roof_squares property
  revenue?: number;
  customerName?: string;
  jobAddress?: string;
}

export class HubSpotService {
  private accessToken: string | null = null;
  private apiClient: AxiosInstance;
  private readonly HUBSPOT_API_BASE = 'https://api.hubapi.com';

  constructor(accessToken?: string) {
    this.accessToken = accessToken || null;
    this.apiClient = axios.create({
      baseURL: this.HUBSPOT_API_BASE,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
    this.apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Fetch deals in the Contract Signed pipeline stage (internal name: 60609660)
   */
  async fetchPendingJobs(limit: number = 100): Promise<HubSpotJob[]> {
    try {
      const response = await this.apiClient.post('/crm/v3/objects/deals/search', {
        limit,
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'dealstage',
                operator: 'EQ',
                value: '60609660',
              },
            ],
          },
        ],
        properties: [
          'dealname',
          'dealstage',
          'amount',
          'closedate',
          'notes',
          'associatedcompany',
          'job_type',
          'roof_squares',
        ],
      });

      return response.data.results || [];
    } catch (error) {
      console.error('Error fetching Contract Signed deals from HubSpot:', error);
      throw new Error('Failed to fetch deals from HubSpot');
    }
  }

  /**
   * Fetch tickets in the T/O to Production pipeline stage (internal name: 61001855)
   * and return their roof_squares and job_type properties
   */
  async fetchProductionTickets(limit: number = 100): Promise<HubSpotTicket[]> {
    try {
      const response = await this.apiClient.post('/crm/v3/objects/tickets/search', {
        limit,
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'hs_pipeline_stage',
                operator: 'EQ',
                value: '61001855',
              },
            ],
          },
        ],
        properties: [
          'subject',
          'hs_pipeline_stage',
          'roof_squares',
          'job_type',
        ],
      });

      return response.data.results || [];
    } catch (error) {
      console.error('Error fetching T/O to Production tickets from HubSpot:', error);
      throw new Error('Failed to fetch production tickets from HubSpot');
    }
  }

  /**
   * Aggregate roof_squares from tickets by job type.
   * "Metal Roofing" → metal total, "Shingles Roof" → shingles total
   */
  aggregateRoofingSquares(tickets: HubSpotTicket[]): RoofingSquaresSummary {
    let metal = 0;
    let shingles = 0;

    for (const ticket of tickets) {
      const sqs = parseFloat(ticket.properties.roof_squares || '0') || 0;
      const jobType = ticket.properties.job_type || '';

      if (jobType === 'Metal Roofing') {
        metal += sqs;
      } else if (jobType === 'Shingles Roof') {
        shingles += sqs;
      }
    }

    return { metal, shingles };
  }

  /**
   * Map HubSpot job data to internal format
   */
  mapJobData(hubspotJob: HubSpotJob): JobMapping {
    const props = hubspotJob.properties;

    // Extract estimated duration from notes or use default
    const estimatedDuration = this.extractDurationFromNotes(props.notes) || 5;

    // Map HubSpot job_type values to DB crew_type
    // "Metal Roofing" → 'Metal Roofing', "Shingles Roof" → 'Shingles Roof'
    const crewType: string | undefined =
      props.job_type === 'Metal Roofing' || props.job_type === 'Shingles Roof'
        ? props.job_type
        : undefined;

    // roof_squares from HubSpot → square_footage in DB
    const squareFootage = props.roof_squares ? parseFloat(props.roof_squares) : undefined;

    return {
      jobId: hubspotJob.id,
      installDate: this.formatDate(props.closedate),
      estimatedDuration,
      crewSize: this.extractCrewSizeFromNotes(props.notes) || 3,
      crewType,
      squareFootage,
      revenue: props.amount ? parseFloat(props.amount) : undefined,
      customerName: props.associatedcompany || props.dealname,
      jobAddress: props.notes || '',
    };
  }

  /**
   * Sync jobs from HubSpot to local database
   */
  async syncJobs(userId: string): Promise<{ created: number; updated: number; total: number }> {
    try {
      const hubspotJobs = await this.fetchPendingJobs();
      let created = 0;
      let updated = 0;

      for (const hubspotJob of hubspotJobs) {
        const mappedJob = this.mapJobData(hubspotJob);

        // Check if job already exists
        const existingResult = await query(
          'SELECT id FROM jobs WHERE job_id = $1',
          [mappedJob.jobId]
        );

        if (existingResult.rows.length > 0) {
          // Update existing job — includes crew_type and square_footage from HubSpot
          await query(
            `UPDATE jobs SET
              install_date = $1,
              estimated_duration = $2,
              crew_size = $3,
              crew_type = $4,
              square_footage = $5,
              revenue = $6,
              customer_name = $7,
              job_address = $8,
              updated_at = CURRENT_TIMESTAMP
             WHERE job_id = $9`,
            [
              mappedJob.installDate,
              mappedJob.estimatedDuration,
              mappedJob.crewSize,
              mappedJob.crewType || null,
              mappedJob.squareFootage || null,
              mappedJob.revenue || null,
              mappedJob.customerName,
              mappedJob.jobAddress,
              mappedJob.jobId,
            ]
          );
          updated++;
        } else {
          // Create new job — includes crew_type and square_footage from HubSpot
          await query(
            `INSERT INTO jobs
             (id, job_id, hubspot_id, install_date, estimated_duration, crew_size, crew_type, square_footage, revenue, customer_name, job_address, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              await getUUID(),
              mappedJob.jobId,
              hubspotJob.id,
              mappedJob.installDate,
              mappedJob.estimatedDuration,
              mappedJob.crewSize,
              mappedJob.crewType || null,
              mappedJob.squareFootage || null,
              mappedJob.revenue || null,
              mappedJob.customerName,
              mappedJob.jobAddress,
              'pending',
            ]
          );
          created++;
        }
      }

      return {
        created,
        updated,
        total: hubspotJobs.length,
      };
    } catch (error) {
      console.error('Error syncing jobs:', error);
      throw new Error('Failed to sync jobs from HubSpot');
    }
  }

  /**
   * Extract duration from notes field (looks for "X days" pattern)
   */
  private extractDurationFromNotes(notes: string | undefined): number | null {
    if (!notes) return null;
    const match = notes.match(/(\d+)\s*days?/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Extract crew size from notes field (looks for "X crew" or "X people" pattern)
   */
  private extractCrewSizeFromNotes(notes: string | undefined): number | null {
    if (!notes) return null;
    const match = notes.match(/(\d+)\s*(crew|people|team members?)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Format date from HubSpot format (typically ISO) to YYYY-MM-DD
   */
  private formatDate(dateString: string | undefined): string {
    if (!dateString) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString().split('T')[0];
    }
    return dateString.split('T')[0];
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(clientId: string, redirectUri: string, scopes: string[] = []): string {
    const defaultScopes = [
      'crm.objects.deals.read',
      'crm.objects.contacts.read',
      'crm.objects.companies.read',
    ];

    const allScopes = scopes.length > 0 ? scopes : defaultScopes;

    return (
      `https://app.hubapi.com/oauth/authorize?` +
      `client_id=${clientId}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(allScopes.join(' '))}&` +
      `response_type=code`
    );
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string
  ): Promise<string> {
    try {
      const response = await axios.post('https://api.hubapi.com/oauth/v1/token', {
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        code,
      });

      return response.data.access_token;
    } catch (error) {
      console.error('Error exchanging code for token:', error);
      throw new Error('Failed to obtain access token from HubSpot');
    }
  }
}

export default HubSpotService;
