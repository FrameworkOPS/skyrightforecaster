import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../utils/apiConfig';
import { getLeadTimeStatus, getLeadTimeColorClass } from '../constants/businessConstants';

// ─── Types ─────────────────────────────────────────────────────────────────

interface CrewDetail {
  id: string;
  name: string;
  weeklyCapacity: number;
  productionRate: number;
  rampPercent: number;
  isBlocked: boolean;
  leads: number;
  supers: number;
}

interface MetricsSnapshot {
  metric_week: string;
  job_type: string;
  pipeline_sqs: number;
  pipeline_jobs: number;
  pipeline_value: number;
  sales_forecast_sqs: number;
  production_rate_sqs: number;
  revenue_projected: number;
  avg_lead_time_days: number;
  bottleneck_detected: boolean;
  leadTimeWeeks: number;
  leadTimeStatus: string;
  crewCount: number;
  totalLeads: number;
  totalSupervisors: number;
  crews: CrewDetail[];
}

// ─── Drill-down modal ──────────────────────────────────────────────────────

function DrillDownModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── Clickable KPI card ────────────────────────────────────────────────────

function MetricsCard({
  title,
  value,
  unit,
  type,
  onClick,
}: {
  title: string;
  value: string | number;
  unit: string;
  type: 'shingle' | 'metal';
  onClick?: () => void;
}) {
  const bgColor   = type === 'shingle' ? 'bg-cyan-50 border-cyan-200'   : 'bg-pink-50 border-pink-200';
  const textColor = type === 'shingle' ? 'text-cyan-700'                : 'text-pink-700';
  const badgeColor = type === 'shingle' ? 'bg-cyan-100 text-cyan-800'   : 'bg-pink-100 text-pink-800';
  const clickable  = !!onClick;

  return (
    <div
      onClick={onClick}
      className={`${bgColor} border rounded-lg p-4 ${clickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    >
      <p className={`text-sm font-medium ${textColor} flex items-center gap-1`}>
        {title}
        {clickable && <span className="text-xs opacity-60">(click)</span>}
      </p>
      <p className="text-2xl font-bold text-gray-900 mt-2">{value}</p>
      <p className={`text-xs mt-1 ${badgeColor} inline-block px-2 py-1 rounded`}>{unit}</p>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function MetricsDashboard() {
  const { token } = useAuthStore();
  const [metrics, setMetrics] = useState<MetricsSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState<{ type: string; jobType: 'shingle' | 'metal' } | null>(null);

  useEffect(() => { loadMetrics(); }, []);

  const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
    return d;
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
      const start = getMonday(new Date());
      const end = new Date(start);
      end.setDate(end.getDate() + 84); // 12 weeks for charts
      const params = new URLSearchParams({
        startWeek: formatDate(start),
        endWeek:   formatDate(end),
      });
      const res = await fetch(`${API_BASE_URL}/api/metrics/dashboard?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.data || []);
      }
    } catch (err) {
      console.error('Error loading metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Split by type ───────────────────────────────────────────────────────
  const shingleMetrics = metrics
    .filter((m) => m.job_type === 'shingle')
    .sort((a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime());
  const metalMetrics = metrics
    .filter((m) => m.job_type === 'metal')
    .sort((a, b) => new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime());

  // ── Current-week tile values (live, not 12-week sum) ───────────────────
  const currentShingle = shingleMetrics[0] ?? null;
  const currentMetal   = metalMetrics[0]   ?? null;

  // ── Chart data (rolling pipeline) ─────────────────────────────────────
  const chartData = shingleMetrics.map((sm) => {
    const mm = metalMetrics.find((m) => m.metric_week === sm.metric_week);
    return {
      week: new Date(sm.metric_week + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
      }),
      shinglePipeline:      sm.pipeline_sqs,
      metalPipeline:        mm?.pipeline_sqs ?? 0,
      shingleProduction:    sm.production_rate_sqs,
      metalProduction:      mm?.production_rate_sqs ?? 0,
      shingleSalesForecast: sm.sales_forecast_sqs,
      metalSalesForecast:   mm?.sales_forecast_sqs ?? 0,
      // Revenue in $K for readability
      shingleRevenue:       (sm.revenue_projected) / 1000,
      metalRevenue:         ((mm?.revenue_projected) ?? 0) / 1000,
    };
  });

  // ── Helpers for drill-down content ────────────────────────────────────
  const getCrews = (jobType: 'shingle' | 'metal') =>
    jobType === 'shingle' ? (currentShingle?.crews ?? []) : (currentMetal?.crews ?? []);

  const getLeadStaff = (jobType: 'shingle' | 'metal') =>
    getCrews(jobType).filter((c) => c.leads > 0);

  const getSuperStaff = (jobType: 'shingle' | 'metal') =>
    getCrews(jobType).filter((c) => c.supers > 0);

  // ── Render tile section per job type ─────────────────────────────────
  const renderTiles = (
    jobType: 'shingle' | 'metal',
    current: MetricsSnapshot | null
  ) => {
    const label     = jobType === 'shingle' ? 'Shingles' : 'Metal';
    const headColor = jobType === 'shingle' ? 'text-cyan-900' : 'text-pink-900';
    const dotColor  = jobType === 'shingle' ? 'bg-cyan-500'   : 'bg-pink-500';
    const leadTimeWeeks = current
      ? Math.round(current.avg_lead_time_days / 7)
      : 0;
    const ltStatus = getLeadTimeStatus(leadTimeWeeks);
    const ltClass  = getLeadTimeColorClass(ltStatus);
    const revenueStr = current
      ? current.revenue_projected >= 1_000_000
        ? `$${(current.revenue_projected / 1_000_000).toFixed(2)}M`
        : `$${(current.revenue_projected / 1_000).toFixed(0)}K`
      : '$0';

    return (
      <div className="space-y-4">
        <h3 className={`text-lg font-semibold ${headColor} flex items-center gap-2`}>
          <span className={`w-3 h-3 ${dotColor} rounded-full`}></span>
          {label}
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <MetricsCard
            title="Pipeline"
            value={current ? current.pipeline_sqs.toFixed(0) : '—'}
            unit="SQs now"
            type={jobType}
          />
          <MetricsCard
            title="Sales Forecast"
            value={current ? current.sales_forecast_sqs.toFixed(0) : '—'}
            unit="SQs this week"
            type={jobType}
          />
          <MetricsCard
            title="Production Rate"
            value={current ? current.production_rate_sqs.toFixed(0) : '—'}
            unit="SQs/week"
            type={jobType}
          />
          <div className={`${jobType === 'shingle' ? 'bg-cyan-50 border-cyan-200' : 'bg-pink-50 border-pink-200'} border rounded-lg p-4`}>
            <p className={`text-sm font-medium ${jobType === 'shingle' ? 'text-cyan-700' : 'text-pink-700'}`}>
              Lead Time
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-2">{leadTimeWeeks}w</p>
            <span className={`text-xs mt-1 inline-block px-2 py-1 rounded font-semibold ${ltClass}`}>
              {ltStatus}
            </span>
          </div>
          <MetricsCard
            title="Crews"
            value={current ? current.crewCount : '—'}
            unit="active"
            type={jobType}
            onClick={() => setModal({ type: 'crews', jobType })}
          />
          <MetricsCard
            title="Leads"
            value={current ? current.totalLeads : '—'}
            unit="total"
            type={jobType}
            onClick={() => setModal({ type: 'leads', jobType })}
          />
          <MetricsCard
            title="Site Supers"
            value={current ? current.totalSupervisors : '—'}
            unit="total"
            type={jobType}
            onClick={() => setModal({ type: 'supers', jobType })}
          />
          <MetricsCard
            title="Revenue / Week"
            value={revenueStr}
            unit="production value"
            type={jobType}
          />
        </div>
      </div>
    );
  };

  // ── Modal content ──────────────────────────────────────────────────────
  const renderModalContent = () => {
    if (!modal) return null;
    const crews = getCrews(modal.jobType);
    const typeLabel = modal.jobType === 'shingle' ? 'Shingle' : 'Metal';

    if (modal.type === 'crews') {
      return (
        <DrillDownModal
          title={`${typeLabel} Crews — Current Week`}
          onClose={() => setModal(null)}
        >
          {crews.length === 0 ? (
            <p className="text-gray-500">No active crews this week.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Crew Name</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Capacity</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Effective</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Ramp</th>
                  <th className="text-center py-2 px-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {crews.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-medium text-gray-900">{c.name}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.weeklyCapacity} SQs</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.productionRate} SQs</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.rampPercent}%</td>
                    <td className="py-2 px-3 text-center">
                      {c.isBlocked ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">Blocked</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Active</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td className="py-2 px-3 font-bold text-gray-900">Total</td>
                  <td className="py-2 px-3 text-right font-bold">{crews.reduce((s, c) => s + c.weeklyCapacity, 0)} SQs</td>
                  <td className="py-2 px-3 text-right font-bold">{crews.reduce((s, c) => s + c.productionRate, 0)} SQs</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          )}
        </DrillDownModal>
      );
    }

    if (modal.type === 'leads') {
      const withLeads = crews.filter((c) => c.leads > 0);
      return (
        <DrillDownModal
          title={`${typeLabel} Leads — Current Week`}
          onClose={() => setModal(null)}
        >
          {withLeads.length === 0 ? (
            <p className="text-gray-500">No leads recorded for {typeLabel} crews. Add them in the Crews tab.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Crew</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Leads</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Prod Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withLeads.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-3 font-medium text-gray-900">{c.name}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.leads}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.productionRate} SQs/wk</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td className="py-2 px-3 font-bold">Total</td>
                  <td className="py-2 px-3 text-right font-bold">{withLeads.reduce((s, c) => s + c.leads, 0)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </DrillDownModal>
      );
    }

    if (modal.type === 'supers') {
      const withSupers = crews.filter((c) => c.supers > 0);
      return (
        <DrillDownModal
          title={`${typeLabel} Site Supervisors — Current Week`}
          onClose={() => setModal(null)}
        >
          {withSupers.length === 0 ? (
            <p className="text-gray-500">No site supervisors recorded for {typeLabel} crews. Add them in the Crews tab.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-600">Crew</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Site Supers</th>
                  <th className="text-right py-2 px-3 font-medium text-gray-600">Prod Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {withSupers.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 px-3 font-medium text-gray-900">{c.name}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.supers}</td>
                    <td className="py-2 px-3 text-right text-gray-700">{c.productionRate} SQs/wk</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-gray-200 bg-gray-50">
                <tr>
                  <td className="py-2 px-3 font-bold">Total</td>
                  <td className="py-2 px-3 text-right font-bold">{withSupers.reduce((s, c) => s + c.supers, 0)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </DrillDownModal>
      );
    }

    return null;
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* Modal */}
      {modal && renderModalContent()}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Metrics Dashboard</h2>
          <p className="text-gray-600 text-sm mt-1">
            Live current-week KPIs · 12-week charts · Click crew/staff tiles to drill down
          </p>
        </div>
        <button
          onClick={loadMetrics}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading metrics…</div>
      ) : metrics.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center space-y-4">
          <div className="text-gray-400 text-5xl">---</div>
          <h3 className="text-lg font-semibold text-gray-700">No Metrics Data Yet</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            Add crews, pipeline items, and sales forecasts — metrics auto-calculate from that data.
          </p>
          <button onClick={loadMetrics} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* KPI Tiles — current week (live) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {renderTiles('shingle', currentShingle)}
            {renderTiles('metal',   currentMetal)}
          </div>

          {/* Charts */}
          <div className="space-y-6">
            {/* Rolling Pipeline vs Production Rate */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
              <h3 className="text-lg font-semibold mb-1 text-gray-900">Pipeline vs Production Rate</h3>
              <p className="text-xs text-gray-500 mb-4">Pipeline depletes as crews produce and grows as sales close — 12-week rolling view</p>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis label={{ value: 'SQs', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="shinglePipeline"   name="Shingle Pipeline"   stroke="#06b6d4" strokeWidth={2} />
                  <Line type="monotone" dataKey="metalPipeline"     name="Metal Pipeline"     stroke="#ec4899" strokeWidth={2} />
                  <Line type="monotone" dataKey="shingleProduction"  name="Shingle Prod Rate"  stroke="#0891b2" strokeWidth={2} strokeDasharray="5 5" />
                  <Line type="monotone" dataKey="metalProduction"    name="Metal Prod Rate"    stroke="#be185d" strokeWidth={2} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sales Forecast */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
              <h3 className="text-lg font-semibold mb-1 text-gray-900">Weekly Sales Forecast</h3>
              <p className="text-xs text-gray-500 mb-4">SQs expected to close each week from your Sales Forecast tab</p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis label={{ value: 'SQs', angle: -90, position: 'insideLeft' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="shingleSalesForecast" name="Shingle Forecast" fill="#06b6d4" />
                  <Bar dataKey="metalSalesForecast"   name="Metal Forecast"   fill="#ec4899" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Revenue Projection — weekly production value */}
            <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
              <h3 className="text-lg font-semibold mb-1 text-gray-900">Weekly Revenue Projection</h3>
              <p className="text-xs text-gray-500 mb-4">Production value per week = crew capacity × $/SQ (Shingle $600, Metal $1,000)</p>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis
                    tickFormatter={(v) => `$${v}K`}
                    label={{ value: 'Revenue ($K)', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip formatter={(v: number) => [`$${v.toFixed(0)}K`, '']} />
                  <Legend />
                  <Area type="monotone" dataKey="shingleRevenue" name="Shingle Revenue" fill="#06b6d4" stroke="#0891b2" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="metalRevenue"   name="Metal Revenue"   fill="#ec4899" stroke="#be185d" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Weekly detail table */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Weekly Detail — 12-Week Outlook</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Week</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Type</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Pipeline</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Sales Fcst</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Prod Rate</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Rev/Wk</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">Lead Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {metrics
                    .sort((a, b) => {
                      const weekDiff = new Date(a.metric_week).getTime() - new Date(b.metric_week).getTime();
                      return weekDiff !== 0 ? weekDiff : a.job_type.localeCompare(b.job_type);
                    })
                    .map((m, idx) => {
                      const ltWeeks  = Math.round(m.avg_lead_time_days / 7);
                      const ltStatus = getLeadTimeStatus(ltWeeks);
                      const ltClass  = getLeadTimeColorClass(ltStatus);
                      const typeBadge = m.job_type === 'shingle'
                        ? 'bg-cyan-100 text-cyan-800'
                        : 'bg-pink-100 text-pink-800';
                      const revStr = m.revenue_projected >= 1_000_000
                        ? `$${(m.revenue_projected / 1_000_000).toFixed(2)}M`
                        : `$${(m.revenue_projected / 1_000).toFixed(0)}K`;

                      return (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {new Date(m.metric_week + 'T00:00:00').toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${typeBadge}`}>
                              {m.job_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.pipeline_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.sales_forecast_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{m.production_rate_sqs.toFixed(0)}</td>
                          <td className="px-4 py-3 text-right text-gray-900">{revStr}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${ltClass}`}>
                              {ltWeeks}w
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
