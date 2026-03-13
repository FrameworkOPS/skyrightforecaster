import { create } from 'zustand';

interface MetricsSnapshot {
  metric_week: string;
  job_type: string;
  pipeline_sqs: number;
  pipeline_jobs: number;
  sales_forecast_sqs: number;
  production_rate_sqs: number;
  revenue_projected: number;
  revenue_produced: number;
  queue_growth: number;
  avg_lead_time_days: number;
  capacity_utilization: number;
  bottleneck_detected: boolean;
  bottleneck_reason: string | null;
}

interface LeadTimeAnalysis {
  jobType: string;
  currentLeadTime: number;
  avgLeadTime: number;
  maxLeadTime: number;
  minLeadTime: number;
  weeksAnalyzed: number;
  trend: 'increasing' | 'decreasing' | 'stable' | 'no_data';
}

interface RevenueAnalysis {
  byType: {
    [key: string]: {
      jobType: string;
      totalProjected: string;
      totalProduced: string;
      variance: string;
      weeksAnalyzed: number;
      avgProjected: string;
      avgProduced: string;
    };
  };
  combined: {
    totalProjected: string;
    totalProduced: string;
    variance: string;
    accuracyPercent: string;
  };
}

interface CapacityAnalysis {
  jobType: string;
  avgUtilization: string;
  maxUtilization: string;
  minUtilization: string;
  bottleneckWeeks: number;
  totalWeeks: number;
  bottleneckPercentage: string;
  recommendations: string[];
}

interface MetricsStore {
  // State
  metrics: MetricsSnapshot[];
  leadTimeAnalysis: { [key: string]: LeadTimeAnalysis };
  revenueAnalysis: RevenueAnalysis | null;
  capacityAnalysis: { [key: string]: CapacityAnalysis };
  loading: boolean;
  cacheTime: number;

  // Filters
  selectedStartWeek: string;
  selectedEndWeek: string;
  selectedJobType: 'shingle' | 'metal' | 'all';

  // Actions
  setMetrics(metrics: MetricsSnapshot[]): void;
  setLeadTimeAnalysis(analysis: { [key: string]: LeadTimeAnalysis }): void;
  setRevenueAnalysis(analysis: RevenueAnalysis): void;
  setCapacityAnalysis(analysis: { [key: string]: CapacityAnalysis }): void;
  setLoading(loading: boolean): void;

  fetchMetrics(startWeek: string, endWeek: string, jobType?: string, token?: string): Promise<void>;
  fetchLeadTimeAnalysis(jobType: string, weeks?: number, token?: string): Promise<void>;
  fetchRevenueAnalysis(startWeek?: string, endWeek?: string, jobType?: string, token?: string): Promise<void>;
  fetchCapacityAnalysis(jobType: string, weeks?: number, token?: string): Promise<void>;

  setSelectedWeeks(start: string, end: string): void;
  setSelectedJobType(type: 'shingle' | 'metal' | 'all'): void;

  clearCache(): void;
  isCacheValid(): boolean;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

export const useMetricsStore = create<MetricsStore>((set, get) => ({
  // Initial state
  metrics: [],
  leadTimeAnalysis: {},
  revenueAnalysis: null,
  capacityAnalysis: {},
  loading: false,
  cacheTime: 0,
  selectedStartWeek: '',
  selectedEndWeek: '',
  selectedJobType: 'all',

  // Setters
  setMetrics: (metrics) => set({ metrics }),
  setLeadTimeAnalysis: (analysis) => set({ leadTimeAnalysis: analysis }),
  setRevenueAnalysis: (analysis) => set({ revenueAnalysis: analysis }),
  setCapacityAnalysis: (analysis) => set({ capacityAnalysis: analysis }),
  setLoading: (loading) => set({ loading }),

  setSelectedWeeks: (start, end) => set({ selectedStartWeek: start, selectedEndWeek: end }),
  setSelectedJobType: (type) => set({ selectedJobType: type }),

  clearCache: () => set({
    metrics: [],
    leadTimeAnalysis: {},
    revenueAnalysis: null,
    capacityAnalysis: {},
    cacheTime: 0
  }),

  isCacheValid: () => {
    const { cacheTime } = get();
    return cacheTime > 0 && Date.now() - cacheTime < CACHE_DURATION_MS;
  },

  // API Fetchers
  fetchMetrics: async (startWeek, endWeek, jobType, token) => {
    const state = get();
    if (state.loading) return;

    set({ loading: true });
    try {
      const params = new URLSearchParams();
      params.append('startWeek', startWeek);
      params.append('endWeek', endWeek);
      if (jobType && jobType !== 'all') {
        params.append('jobType', jobType);
      }

      const res = await fetch(`${API_URL}/api/metrics/dashboard?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        set({
          metrics: data.data || [],
          cacheTime: Date.now()
        });
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      set({ loading: false });
    }
  },

  fetchLeadTimeAnalysis: async (jobType, weeks = 4, token) => {
    const state = get();
    if (state.loading) return;

    set({ loading: true });
    try {
      const params = new URLSearchParams();
      params.append('jobType', jobType);
      params.append('weeks', weeks.toString());

      const res = await fetch(`${API_URL}/api/metrics/lead-time-analysis?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const analysis = get().leadTimeAnalysis;
        analysis[jobType] = data.data;
        set({
          leadTimeAnalysis: analysis,
          cacheTime: Date.now()
        });
      }
    } catch (error) {
      console.error('Error fetching lead time analysis:', error);
    } finally {
      set({ loading: false });
    }
  },

  fetchRevenueAnalysis: async (startWeek, endWeek, jobType, token) => {
    const state = get();
    if (state.loading) return;

    set({ loading: true });
    try {
      const params = new URLSearchParams();
      if (startWeek) params.append('startWeek', startWeek);
      if (endWeek) params.append('endWeek', endWeek);
      if (jobType && jobType !== 'all') params.append('jobType', jobType);

      const res = await fetch(`${API_URL}/api/metrics/revenue-analysis?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        set({
          revenueAnalysis: data.data,
          cacheTime: Date.now()
        });
      }
    } catch (error) {
      console.error('Error fetching revenue analysis:', error);
    } finally {
      set({ loading: false });
    }
  },

  fetchCapacityAnalysis: async (jobType, weeks = 4, token) => {
    const state = get();
    if (state.loading) return;

    set({ loading: true });
    try {
      const params = new URLSearchParams();
      params.append('jobType', jobType);
      params.append('weeks', weeks.toString());

      const res = await fetch(`${API_URL}/api/metrics/capacity-analysis?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const analysis = get().capacityAnalysis;
        analysis[jobType] = data.data;
        set({
          capacityAnalysis: analysis,
          cacheTime: Date.now()
        });
      }
    } catch (error) {
      console.error('Error fetching capacity analysis:', error);
    } finally {
      set({ loading: false });
    }
  }
}));
