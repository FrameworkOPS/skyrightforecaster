/**
 * Business Logic Constants - Frontend
 * Matches backend constants for consistent calculations
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

// Get color for lead time status
export function getLeadTimeColor(status: 'RED' | 'YELLOW' | 'GREEN'): string {
  const colors = {
    RED: '#ef4444',      // Red for critical
    YELLOW: '#eab308',   // Yellow for warning
    GREEN: '#22c55e',    // Green for good
  };
  return colors[status];
}

// Get Tailwind color classes for lead time status
export function getLeadTimeColorClass(status: 'RED' | 'YELLOW' | 'GREEN'): string {
  const classes = {
    RED: 'bg-red-100 text-red-800 border-red-300',
    YELLOW: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    GREEN: 'bg-green-100 text-green-800 border-green-300',
  };
  return classes[status];
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

// Job types enum
export enum JobType {
  SHINGLES = 'shingle',
  METAL = 'metal',
}

// Job type labels
export const JOB_TYPE_LABELS = {
  [JobType.SHINGLES]: 'Shingles',
  [JobType.METAL]: 'Metal',
};
