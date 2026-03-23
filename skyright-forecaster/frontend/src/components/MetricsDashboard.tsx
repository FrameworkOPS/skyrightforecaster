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

interface CrewMetrics {
  crew_name: string;
  crew_type: string;
  production_sqs: number;
  lead_count: number;
  super_count: number;
}


export default function MetricsDashboard() {
  const { token } = useAuthStore();
  const [metrics, setMetrics] = useState<MetricsSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [startWeek, setStartWeek] = useState('');
  const [endWeek, setEndWeek] = useState('');
  const [selectedType, setSelectedType] = useState<'shingle' | 'metal' | 'all'>('all');

  useEffect(() => {
    // Initialize 12-week range
    const today = new Date();
    const start = getMonday(today);
    const end = new Date(start);
    end.setDate(end.getDate() + 84); // 12 weeks

    setStartWeek(formatDate(start));
    setEndWeek(formatDate(end));
  }, []);

  useEffect(() => {
    if (startWeek && endWeek) {
      loadMetrics();
    }
  }, [startWeek, endWeek, selectedType]);

  const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };

  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const loadMetrics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('startWeek', startWeek);
      params.append('endWeek', endWeek);
      if (selectedType !== 'all') {
        params.append('jobType', selectedType);
      }

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

  // Prepare chart data
  const chartData = Array.from(
    new Map(
      metrics.map(m => [m.metric_week, m])
    ).values()
  )
    .sort((a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime())
    .map(m => ({
      week: new Date(m.metric_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      fullWeek: m.metric_week,
      pipelineSQs: selectedType === 'all' || selectedType === m.job_type ? m.pipeline_sqs : 0,
      salesForecast: selectedType === 'all' || selectedType === m.job_type ? m.sales_forecast_sqs : 0,
      production: selectedType === 'all' || selectedType === m.job_type ? m.production_rate_sqs : 0,
      revenueProjected: selectedType === 'all' || selectedType === m.job_type ? m.revenue_projected / 1000000 : 0,
      revenueProduced: selectedType === 'all' || selectedType === m.job_type ? m.revenue_produced / 1000000 : 0,
      leadTime: selectedType === 'all' || selectedType === m.job_type ? m.avg_lead_time_days : 0,
      utilization: (selectedType === 'all' || selectedType === m.job_type ? m.capacity_utilization : 0) * 100,
      bottleneck: m.bottleneck_detected ? 1 : 0
    }));

  // Calculate KPIs
  const currentMetrics = metrics.filter(m => selectedType === 'all' || selectedType === m.job_type);
  const pipelineTotals = currentMetrics.reduce((sum, m) => sum + m.pipeline_sqs, 0);
  const revenueTotals = currentMetrics.reduce((sum, m) => sum + m.revenue_projected, 0);
  const avgLeadTime = currentMetrics.length > 0
    ? Math.round(currentMetrics.reduce((sum, m) => sum + m.avg_lead_time_days, 0) / currentMetrics.length)
    : 0;
  const avgUtilization = currentMetrics.length > 0
    ? ((currentMetrics.reduce((sum, m) => sum + m.capacity_utilization, 0) / currentMetrics.length) * 100).toFixed(1)
    : '0';
  const bottleneckCount = currentMetrics.filter(m => m.bottleneck_detected).length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Metrics Dashboard</h2>
      </div>

      {/* Alerts */}
      {bottleneckCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
          <p className="text-red-800 font-medium">
            🚨 Bottleneck detected in {bottleneckCount} week(s) - review capacity and production
          </p>
        </div>
      )}

      {/* Week Range & Filters */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Week</label>
            <input
              type="date"
              value={startWeek}
              onChange={(e) => setStartWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Week</label>
            <input
              type="date"
              value={endWeek}
              onChange={(e) => setEndWeek(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as 'shingle' | 'metal' | 'all')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="all">All Types (Combined)</option>
              <option value="shingle">Shingle Only</option>
              <option value="metal">Metal Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Key KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <p className="text-sm font-medium text-blue-600">Pipeline Size</p>
          <p className="text-2xl font-bold text-blue-900">{pipelineTotals.toFixed(0)}</p>
          <p className="text-xs text-blue-700 mt-1">SQs in queue</p>
        </div>

        <div className={`bg-green-50 p-4 rounded-lg border border-green-200`}>
          <p className="text-sm font-medium text-green-600">Lead Time</p>
          <p className="text-2xl font-bold text-green-900">{Math.round(avgLeadTime / 7)}w {avgLeadTime % 7}d</p>
          <p className="text-xs text-green-700 mt-1">{getLeadTimeStatus(Math.round(avgLeadTime / 7))} status</p>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <p className="text-sm font-medium text-purple-600">Revenue Projected</p>
          <p className="text-2xl font-bold text-purple-900">${(revenueTotals).toFixed(0)}</p>
          <p className="text-xs text-purple-700 mt-1">Period forecast</p>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
          <p className="text-sm font-medium text-orange-600">Capacity Util.</p>
          <p className="text-2xl font-bold text-orange-900">{avgUtilization}%</p>
          <p className="text-xs text-orange-700 mt-1">Average utilization</p>
        </div>
      </div>

      {/* Charts */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading metrics...</div>
      ) : chartData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No metrics data available for selected period</div>
      ) : (
        <>
          {/* Chart 1: Pipeline vs Production */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Pipeline vs Production</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis label={{ value: 'Square Footage', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pipelineSQs" name="Pipeline" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="salesForecast" name="Sales Forecast" stroke="#3b82f6" strokeWidth={2} />
                <Line type="monotone" dataKey="production" name="Production Rate" stroke="#10b981" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 2: Revenue Projection */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Revenue: Projected vs Actual</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis label={{ value: 'Revenue ($M)', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="revenueProjected" name="Projected" fill="#3b82f6" />
                <Bar dataKey="revenueProduced" name="Actual" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 3: Lead Time Trend */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Lead Time Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis label={{ value: 'Days', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="leadTime" name="Avg Lead Time" stroke="#f59e0b" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Chart 4: Capacity Utilization */}
          <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">Capacity Utilization</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" />
                <YAxis label={{ value: 'Utilization %', angle: -90, position: 'insideLeft' }} />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="utilization" name="Utilization %" fill="#a78bfa" stroke="#7c3aed" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed Metrics Table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Weekly Metrics Detail</h3>
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
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Crews</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Leads/Sups</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Lead Time</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Utilization</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {metrics
                    .sort((a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime())
                    .map((m, idx) => {
                      const leadTimeWeeks = Math.round(m.avg_lead_time_days / 7);
                      const leadTimeStatus = m.leadTimeStatus || getLeadTimeStatus(leadTimeWeeks);
                      const colorClass = getLeadTimeColorClass(leadTimeStatus);

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {new Date(m.metric_week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${
                              m.job_type === 'shingle'
                                ? 'bg-cyan-100 text-cyan-800'
                                : 'bg-pink-100 text-pink-800'
                            }`}>
                              {m.job_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.pipeline_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.sales_forecast_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.production_rate_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-center font-semibold text-gray-900">
                            {m.crewCount || '-'}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-900">
                            <span className="text-xs">{m.totalLeads || 0} L / {m.totalSupervisors || 0} S</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${colorClass}`}>
                              {leadTimeWeeks}w {m.avg_lead_time_days % 7}d
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">{(m.capacity_utilization * 100).toFixed(1)}%</td>
                          <td className="px-4 py-3 text-center">
                            {m.bottleneck_detected ? (
                              <span className="inline-block px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold">
                                ⚠️ Bottleneck
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold">
                                ✓ Normal
                              </span>
                            )}
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
