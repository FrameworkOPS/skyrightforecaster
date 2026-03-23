/**
 * Business Logic Constants
 * Centralized configuration for pricing, rates, and operational parameters
 */

// Closing rate for sales pipeline
export const CLOSING_RATE = 0.40; // 40% closing rate

// Crew type distribution ratios
export const CREW_TYPE_RATIOS = {
  metal: 0.30,    // 30% metal roofing
  shingles: 0.70, // 70% shingles roofing
};

// Revenue per square foot by job type
export const REVENUE_PER_SQ = {
  shingles: 600,  // $600 per sq for shingles
  metal: 1000,    // $1000 per sq for metal
};

// Lead time color-coding thresholds (in weeks)
export const LEAD_TIME_THRESHOLDS = {
  red: 8,     // 8+ weeks = RED (critical)
  yellow: 6,  // 6-8 weeks = YELLOW (warning)
  green: 4,   // 4-5 weeks = GREEN (good)
};

// Lead time status mapping
export function getLeadTimeStatus(weeks: number): 'RED' | 'YELLOW' | 'GREEN' {
  if (weeks >= LEAD_TIME_THRESHOLDS.red) return 'RED';
  if (weeks >= LEAD_TIME_THRESHOLDS.yellow) return 'YELLOW';
  return 'GREEN';
}

// Crew ramp-up parameters (as percentages of full capacity)
export const CREW_RAMP_UP = {
  shingles: {
    startPercent: 0.70,  // 70% capacity start
    endPercent: 1.0,     // 100% capacity end
  },
  metal: {
    startPercent: 0.40,  // 40% capacity start
    endPercent: 1.0,     // 100% capacity end
  },
};

// Crew ramp-down period (days before termination)
export const CREW_RAMP_DOWN_DAYS = 30;

// Bottleneck detection thresholds
export const BOTTLENECK_THRESHOLDS = {
  capacityUtilization: 0.9,  // 90% utilization triggers bottleneck
  queueBacklogSqs: 100,      // 100 SQ backlog triggers bottleneck
  sustainedQueueGrowthWeeks: 2, // 2+ weeks of queue growth triggers bottleneck
};

// Job types enum
export enum JobType {
  SHINGLES = 'shingle',
  METAL = 'metal',
}

// Crew type enum
export const CREW_TYPES = {
  [JobType.SHINGLES]: 'shingles',
  [JobType.METAL]: 'metal',
} as const;
