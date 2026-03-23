/**
 * Metrics-specific Constants
 * Used by metrics calculations and analytics
 */

import { LEAD_TIME_THRESHOLDS } from './businessConstants';

// Lead time status values
export enum LeadTimeStatus {
  RED = 'RED',
  YELLOW = 'YELLOW',
  GREEN = 'GREEN',
}

// Get lead time status based on weeks
export function getLeadTimeStatus(weeks: number): LeadTimeStatus {
  if (weeks >= LEAD_TIME_THRESHOLDS.red) return LeadTimeStatus.RED;
  if (weeks >= LEAD_TIME_THRESHOLDS.yellow) return LeadTimeStatus.YELLOW;
  return LeadTimeStatus.GREEN;
}

// Metrics aggregation period (in weeks)
export const METRICS_AGGREGATION_PERIOD = 1; // Weekly metrics

// Production rate calculation window (in weeks for rolling average)
export const PRODUCTION_RATE_WINDOW = 4; // 4-week rolling average

// Forecast window for 6-month view (in weeks)
export const FORECAST_WINDOW_WEEKS = 26; // 6 months

// Capacity utilization bucket ranges
export const UTILIZATION_BUCKETS = {
  low: { min: 0, max: 0.5, label: 'Low Utilization' },
  medium: { min: 0.5, max: 0.75, label: 'Medium Utilization' },
  high: { min: 0.75, max: 0.9, label: 'High Utilization' },
  critical: { min: 0.9, max: 1.0, label: 'Critical Utilization' },
};

// Queue health status determination
export enum QueueHealthStatus {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

// Queue growth thresholds (in SQs per week)
export const QUEUE_GROWTH_THRESHOLDS = {
  negative: { max: -100, label: 'Rapid Consumption' },      // Consuming queue rapidly
  slight_negative: { min: -100, max: 0, label: 'Consuming' }, // Consuming queue
  stable: { min: 0, max: 100, label: 'Stable' },            // Stable queue
  warning: { min: 100, max: 200, label: 'Growing' },        // Queue growing
  critical: { min: 200, label: 'Rapid Growth' },            // Queue growing rapidly
};

// Bottleneck reasons enum
export enum BottleneckReason {
  CAPACITY = 'CAPACITY_CONSTRAINED',
  QUEUE_GROWTH = 'SUSTAINED_QUEUE_GROWTH',
  RESOURCE_SHORTAGE = 'RESOURCE_SHORTAGE',
  PROJECT_BLOCKING = 'PROJECT_BLOCKING',
  RAMP_UP = 'CREW_RAMP_UP',
  NONE = 'NONE',
}

// Chart data colors
export const CHART_COLORS = {
  pipeline: '#3b82f6',           // Blue - pipeline data
  production: '#10b981',         // Green - production data
  forecast: '#f59e0b',           // Amber - forecast data
  bottleneck: '#ef4444',         // Red - bottleneck indicator
  leadTimeGreen: '#22c55e',      // Green - good lead time
  leadTimeYellow: '#eab308',     // Yellow - warning lead time
  leadTimeRed: '#ef4444',        // Red - critical lead time
  shingle: '#06b6d4',            // Cyan - shingles
  metal: '#ec4899',              // Pink - metal
};

// Time period labels
export const TIME_PERIOD_LABELS = {
  week: 'Week of %DATE%',
  month: '%MONTH% %YEAR%',
  quarter: 'Q%Q% %YEAR%',
};
