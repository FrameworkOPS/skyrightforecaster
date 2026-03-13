import axios from 'axios';

interface ForecastData {
  predictedCapacity: number;
  predictedRevenue: number;
  confidenceScore: number;
  bottleneckDetected: boolean;
  bottleneckDescription?: string;
  jobsData?: any[];
  parametersData?: any;
}

interface InsightResponse {
  summary: string;
  recommendations: string[];
  risks: string[];
  opportunities: string[];
  executiveSummary: string;
}

export class ClaudeService {
  private apiKey: string;
  private apiUrl = 'https://api.anthropic.com/v1/messages';
  private model = 'claude-3-5-sonnet-20241022';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.CLAUDE_API_KEY || '';

    if (!this.apiKey) {
      console.warn('Claude API key not configured');
    }
  }

  async generateInsights(forecastData: ForecastData): Promise<InsightResponse> {
    if (!this.apiKey) {
      return this.generatePlaceholderInsights(forecastData);
    }

    try {
      const prompt = this.buildPrompt(forecastData);

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          max_tokens: 1024,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      const content = response.data.content[0].text;
      return this.parseInsightsResponse(content);
    } catch (error) {
      console.error('Error calling Claude API:', error);
      return this.generatePlaceholderInsights(forecastData);
    }
  }

  async generateRecommendations(bottlenecks: any[]): Promise<string[]> {
    if (!this.apiKey) {
      return [
        'Increase crew capacity to handle concurrent jobs',
        'Stagger job schedules to reduce overlap',
        'Hire additional team members',
        'Improve scheduling efficiency',
      ];
    }

    try {
      const prompt = `Given these production bottlenecks:\n${JSON.stringify(bottlenecks, null, 2)}\n\nProvide 3-4 specific, actionable recommendations to address these bottlenecks.`;

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      const content = response.data.content[0].text;
      return content.split('\n').filter((line: string) => line.trim().length > 0);
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  }

  async analyzeRisks(forecastData: ForecastData): Promise<string[]> {
    if (!this.apiKey) {
      return this.extractRisks(forecastData);
    }

    try {
      const prompt = `Based on this production forecast data:\n${JSON.stringify(forecastData, null, 2)}\n\nIdentify key risks and potential issues. List them clearly.`;

      const response = await axios.post(
        this.apiUrl,
        {
          model: this.model,
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        },
        {
          headers: {
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
        }
      );

      const content = response.data.content[0].text;
      return content.split('\n').filter((line: string) => line.trim().length > 0);
    } catch (error) {
      console.error('Error analyzing risks:', error);
      return this.extractRisks(forecastData);
    }
  }

  private buildPrompt(forecastData: ForecastData): string {
    return `
You are a production forecasting expert for a roofing company. Analyze the following forecast data and provide insights:

Forecast Summary:
- Predicted Capacity: ${forecastData.predictedCapacity} jobs/week
- Predicted Revenue: $${forecastData.predictedRevenue.toFixed(2)}
- Confidence Score: ${(forecastData.confidenceScore * 100).toFixed(0)}%
- Bottleneck Detected: ${forecastData.bottleneckDetected ? 'Yes' : 'No'}
${forecastData.bottleneckDescription ? `- Bottleneck Description: ${forecastData.bottleneckDescription}` : ''}

Please provide:
1. A brief summary of the forecast (2-3 sentences)
2. 3 key recommendations
3. 2-3 potential risks to monitor
4. 2-3 opportunities to capitalize on
5. An executive summary for management

Format your response as JSON with keys: summary, recommendations (array), risks (array), opportunities (array), executiveSummary`;
  }

  private parseInsightsResponse(content: string): InsightResponse {
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
          risks: Array.isArray(parsed.risks) ? parsed.risks : [],
          opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
          executiveSummary: parsed.executiveSummary || '',
        };
      }
    } catch (error) {
      console.error('Error parsing insights response:', error);
    }

    return this.generatePlaceholderInsights({} as ForecastData);
  }

  private generatePlaceholderInsights(forecastData: ForecastData): InsightResponse {
    return {
      summary: `Current production forecast shows ${forecastData.predictedCapacity?.toFixed(1) || 'stable'} jobs/week with ${(forecastData.confidenceScore * 100).toFixed(0)}% confidence.`,
      recommendations: [
        'Monitor crew capacity utilization closely',
        'Plan for seasonal demand variations',
        'Implement predictive maintenance schedules',
        'Optimize job scheduling for maximum throughput',
      ],
      risks: this.extractRisks(forecastData),
      opportunities: [
        'Increase marketing during high-capacity periods',
        'Cross-train crew members for flexibility',
        'Invest in equipment to boost production rates',
      ],
      executiveSummary: `Production forecast indicates ${forecastData.bottleneckDetected ? 'potential constraints' : 'healthy capacity'} with revenue projection of $${forecastData.predictedRevenue?.toFixed(0) || '0'}. Monitor operational metrics closely.`,
    };
  }

  private extractRisks(forecastData: ForecastData): string[] {
    const risks: string[] = [];

    if (forecastData.bottleneckDetected) {
      risks.push('Scheduling bottleneck detected - may delay job completion');
    }

    if (forecastData.confidenceScore < 0.7) {
      risks.push('Low forecast confidence - consider validating assumptions');
    }

    if (forecastData.predictedCapacity < 2) {
      risks.push('Low production capacity - may impact revenue targets');
    }

    if (risks.length === 0) {
      risks.push('Monitor market conditions for potential disruptions');
    }

    return risks;
  }
}

export default ClaudeService;
