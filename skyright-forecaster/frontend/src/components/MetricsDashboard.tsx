import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../utils/apiConfig';
import { REVENUE_PER_SQ, getLeadTimeStatus, getLeadTimeColorClass } from '../constants/businessConstants';

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
  leadTimeStatus?: 'RED' | 'YELLOW' | 'GREEN';
  crewCount?: number;
  totalLeads?: number;
  totalSupervisors?: number;
}

interface TypeMetrics {
  pipeline_sqs: number;
  sales_forecast_sqs: number;
  production_rate_sqs: number;
  revenue_projected: number;
  revenue_produced: number;
  avg_lead_time_days: number;
  bottleneck_detected: boolean;
  crewCount: number;
  totalLeads: number;
  totalSupervisors: number;
}

export default function MetricsDashboard() {
  const { token } = useAuthStore();
  const [metrics, setMetrics] = useState<MetricsSnapshot[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadMetrics();
  }, []);

  const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const formatDate = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      // 12-week window starting from the current Monday
      const today = new Date();
      const start = getMonday(today);
      const end = new Date(start);
      end.setDate(end.getDate() + 84); // 12 weeks

      const params = new URLSearchParams();
      params.append('startWeek', formatDate(start));
      params.append('endWeek', formatDate(end));

      // Dashboard endpoint now computes everything live — no cached snapshots
      const res = await fetch(`${API_BASE_URL}/api/metrics/dashboard?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setMetrics(data.data || []);
      }
    } catch (error) {
      console.error('Error loading metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  // Separate metrics by job type
  const shingleMetrics = metrics.filter(m => m.job_type === 'shingle');
  const metalMetrics = metrics.filter(m => m.job_type === 'metal');

  // Calculate aggregated metrics by type
  const getTypeMetrics = (typeMetrics: MetricsSnapshot[]): TypeMetrics => {
    if (typeMetrics.length === 0) {
      return {
        pipeline_sqs: 0,
        sales_forecast_sqs: 0,
        production_rate_sqs: 0,
        revenue_projected: 0,
        revenue_produced: 0,
        avg_lead_time_days: 0,
        bottleneck_detected: false,
        crewCount: 0,
        totalLeads: 0,
        totalSupervisors: 0,
      };
    }

    // Sort ascending so most recent week is last
    const sorted = [...typeMetrics].sort(
      (a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime()
    );
    const latest = sorted[sorted.length - 1];

    return {
      // pipeline is current snapshot from most recent week
      pipeline_sqs: latest.pipeline_sqs,
      // production rate and sales forecast are per-week rates — use most recent week's value
      sales_forecast_sqs: latest.sales_forecast_sqs,
      production_rate_sqs: latest.production_rate_sqs,
      // revenue totals can be summed across the 12-week window
      revenue_projected: typeMetrics.reduce((sum, m) => sum + m.revenue_projected, 0),
      revenue_produced: typeMetrics.reduce((sum, m) => sum + m.revenue_produced, 0),
      avg_lead_time_days: latest.avg_lead_time_days,
      bottleneck_detected: typeMetrics.some(m => m.bottleneck_detected),
      crewCount: latest.crewCount || 0,
      totalLeads: latest.totalLeads || 0,
      totalSupervisors: latest.totalSupervisors || 0,
    };
  };

  const shingleStats = getTypeMetrics(shingleMetrics);
  const metalStats = getTypeMetrics(metalMetrics);

  // Prepare chart data
  const chartData = Array.from(
    new Map(
      metrics.map(m => [m.metric_week, m])
    ).values()
  )
    .sort((a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime())
    .map(m => ({
      week: new Date(m.metric_week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullWeek: m.metric_week,
      shinglePipeline: shingleMetrics.find(s => s.metric_week === m.metric_week)?.pipeline_sqs || 0,
      metalPipeline: metalMetrics.find(s => s.metric_week === m.metric_week)?.pipeline_sqs || 0,
      shingleSalesForecast: shingleMetrics.find(s => s.metric_week === m.metric_week)?.sales_forecast_sqs || 0,
      metalSalesForecast: metalMetrics.find(s => s.metric_week === m.metric_week)?.sales_forecast_sqs || 0,
      shingleProduction: shingleMetrics.find(s => s.metric_week === m.metric_week)?.production_rate_sqs || 0,
      metalProduction: metalMetrics.find(s => s.metric_week === m.metric_week)?.production_rate_sqs || 0,
      shingleRevenue: (shingleMetrics.find(s => s.metric_week === m.metric_week)?.revenue_projected || 0) / 1000000,
      metalRevenue: (metalMetrics.find(s => s.metric_week === m.metric_week)?.revenue_projected || 0) / 1000000,
    }));

  const MetricsCard = ({ title, value, unit, type }: { title: string; value: string | number; unit: string; type: 'shingle' | 'metal' }) => {
    const bgColor = type === 'shingle' ? 'bg-cyan-50 border-cyan-200' : 'bg-pink-50 border-pink-200';
    const textColor = type === 'shingle' ? 'text-cyan-700' : 'text-pink-700';
    const badgeColor = type === 'shingle' ? 'bg-cyan-100 text-cyan-800' : 'bg-pink-100 text-pink-800';

    return (
      <div className={`${bgColor} border rounded-lg p-4`}>
        <p className={`text-sm font-medium ${textColor}`}>{title}</p>
        <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
        <p className={`text-xs mt-1 ${badgeColor} inline-block px-2 py-1 rounded`}>{unit}</p>
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Metrics Dashboard</h2>
        <p className="text-gray-600 text-sm mt-1">Shingles vs Metal - Current 12-week outlook</p>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading metrics...</div>
      ) : metrics.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="text-gray-400 text-5xl">---</div>
          <h3 className="text-lg font-semibold text-gray-700">No Metrics Data Yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Metrics are calculated from your pipeline, sales forecasts, production actuals, and crew data.
            To populate this dashboard:
          </p>
          <ol className="text-sm text-gray-600 text-left max-w-md mx-auto space-y-2">
            <li><strong>1.</strong> Add crews in the <span className="font-medium">Crews</span> tab</li>
            <li><strong>2.</strong> Add pipeline items in the <span className="font-medium">Pipeline</span> tab</li>
            <li><strong>3.</strong> Enter sales forecasts in the <span className="font-medium">Sales Forecast</span> tab</li>
            <li><strong>4.</strong> Metrics will auto-calculate from this data</li>
          </ol>
          <button
            onClick={loadMetrics}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry Loading Metrics
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards - Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Shingles */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-cyan-900 flex items-center gap-2">
                <span className="w-3 h-3 bg-cyan-500 rounded-full"></span>
                Shingles
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricsCard
                  title="Pipeline"
                  value={shingleStats.pipeline_sqs.toFixed(0)}
                  unit="SQs"
                  type="shingle"
                />
                <MetricsCard
                  title="Sales Forecast"
                  value={shingleStats.sales_forecast_sqs.toFixed(0)}
                  unit="SQs"
                  type="shingle"
                />
                <MetricsCard
                  title="Production Rate"
                  value={shingleStats.production_rate_sqs.toFixed(0)}
                  unit="SQs/week"
                  type="shingle"
                />
                <MetricsCard
                  title="Lead Time"
                  value={Math.round(shingleStats.avg_lead_time_days / 7)}
                  unit="weeks"
                  type="shingle"
                />
                <MetricsCard
                  title="Crews"
                  value={shingleStats.crewCount}
                  unit="active"
                  type="shingle"
                />
                <MetricsCard
                  title="Leads / Sups"
                  value={`${shingleStats.totalLeads}/${shingleStats.totalSupervisors}`}
                  unit="staff"
                  type="shingle"
                />
                <MetricsCard
                  title="Revenue"
                  value={`$${(shingleStats.revenue_projected / 1000000).toFixed(1)}M`}
                  unit="projected"
                  type="shingle"
                />
              </div>
            </div>

            {/* Metal */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-pink-900 flex items-center gap-2">
                <span className="w-3 h-3 bg-pink-500 rounded-full"></span>
                Metal
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MetricsCard
                  title="Pipeline"
                  value={metalStats.pipeline_sqs.toFixed(0)}
                  unit="SQs"
                  type="metal"
                />
                <MetricsCard
                  title="Sales Forecast"
                  value={metalStats.sales_forecast_sqs.toFixed(0)}
                  unit="SQs"
                  type="metal"
                />
                <MetricsCard
                  title="Production Rate"
                  value={metalStats.production_rate_sqs.toFixed(0)}
                  unit="SQs/week"
                  type="metal"
                />
                <MetricsCard
                  title="Lead Time"
                  value={Math.round(metalStats.avg_lead_time_days / 7)}
                  unit="weeks"
                  type="metal"
                />
                <MetricsCard
                  title="Crews"
                  value={metalStats.crewCount}
                  unit="active"
                  type="metal"
                />
                <MetricsCard
                  title="Leads / Sups"
                  value={`${metalStats.totalLeads}/${metalStats.totalSupervisors}`}
                  unit="staff"
                  type="metal"
                />
                <MetricsCard
                  title="Revenue"
                  value={`$${(metalStats.revenue_projected / 1000000).toFixed(1)}M`}
                  unit="projected"
                  type="metal"
                />
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="space-y-6">
            {/* Pipeline vs Production */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Pipeline vs Production</h3>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis label={{ value: 'Square Footage', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="shinglePipeline" name="Shingle Pipeline" stroke="#06b6d4" strokeWidth={2} />
                  <Line type="monotone" dataKey="metalPipeline" name="Metal Pipeline" stroke="#ec4899" strokeWidth={2} />
                  <Line type="monotone" dataKey="shingleProduction" name="Shingle Production" stroke="#0891b2" strokeWidth={2} strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="metalProduction" name="Metal Production" stroke="#be185d" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sales Forecast */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Sales Forecast</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis label={{ value: 'Square Footage', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="shingleSalesForecast" name="Shingle Forecast" fill="#06b6d4" />
                  <Bar dataKey="metalSalesForecast" name="Metal Forecast" fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue Projection */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Revenue Projection</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis label={{ value: 'Revenue ($M)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="shingleRevenue" name="Shingle Revenue" fill="#06b6d4" stroke="#0891b2" />
                  <Area type="monotone" dataKey="metalRevenue" name="Metal Revenue" fill="#ec4899" stroke="#be185d" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Weekly Details</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Week</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Type</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Pipeline</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Sales Fcst</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Production</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {metrics
                    .sort((a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime())
                    .map((m, idx) => {
                      const leadTimeWeeks = Math.round(m.avg_lead_time_days / 7);
                      const leadTimeStatus = m.leadTimeStatus || getLeadTimeStatus(leadTimeWeeks);
                      const colorClass = getLeadTimeColorClass(leadTimeStatus);
                      const badgeClass = m.job_type === 'shingle'
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-pink-100 text-pink-800';

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {new Date(m.metric_week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${badgeClass}`}>
                              {m.job_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.pipeline_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.sales_forecast_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.production_rate_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${colorClass}`}>
                              {leadTimeWeeks}w
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
