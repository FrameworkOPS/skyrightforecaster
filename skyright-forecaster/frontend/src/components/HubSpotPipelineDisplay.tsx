import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { useAuthStore } from '../store/authStore';
import { CLOSING_RATE, CREW_TYPE_RATIOS, REVENUE_PER_SQ } from '../constants/businessConstants';

interface HubSpotDeal {
  hubspot_id: string;
  dealname: string;
  job_type: 'shingle' | 'metal';
  roof_sqs: number;
  using_default_sqs: boolean;
  gross_value: number;
  weighted_value: number;
  estimated_sqs: number;
}

interface RoofingSquares {
  metal: number;
  shingles: number;
}

// ─── Date helpers (mirror SalesForecastInput) ──────────────────────────────

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

const getForecastWeeks = (): string[] => {
  const weeks: string[] = [];
  let current = getMonday(new Date());
  const end = new Date(current);
  end.setDate(end.getDate() + 182);
  while (current <= end) {
    weeks.push(formatDate(new Date(current)));
    current.setDate(current.getDate() + 7);
  }
  return weeks;
};

// ──────────────────────────────────────────────────────────────────────────

export default function HubSpotPipelineDisplay() {
  const { token } = useAuthStore();
  const [deals, setDeals] = useState<HubSpotDeal[]>([]);
  const [roofingSquares, setRoofingSquares] = useState<RoofingSquares | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushingTickets, setPushingTickets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'all' | 'shingle' | 'metal'>('all');

  useEffect(() => {
    loadHubSpotPipeline();
  }, []);

  const loadHubSpotPipeline = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/hubspot/pipeline-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        setError(
          res.status === 401
            ? 'HubSpot not connected. Please authorize first.'
            : 'Failed to load HubSpot pipeline'
        );
        return;
      }

      const data = await res.json();
      setDeals(data.data?.deals || []);
      setRoofingSquares(data.data?.roofingSquares ?? null);
    } catch (err) {
      setError('Error loading HubSpot pipeline');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Distribute total weighted SQs (by type) evenly across the 6-month
   * weekly window and write them to the sales forecast. Confirms before
   * overwriting.
   */
  const handlePushToSalesForecast = async () => {
    const shingleTotal = deals
      .filter((d) => d.job_type === 'shingle')
      .reduce((s, d) => s + d.estimated_sqs, 0);
    const metalTotal = deals
      .filter((d) => d.job_type === 'metal')
      .reduce((s, d) => s + d.estimated_sqs, 0);

    if (shingleTotal === 0 && metalTotal === 0) {
      alert('No weighted SQs to push — no deals in pipeline.');
      return;
    }

    const weeks = getForecastWeeks();
    const numWeeks = weeks.length;
    const weeklyShingle = Math.round(shingleTotal / numWeeks);
    const weeklyMetal = Math.round(metalTotal / numWeeks);

    const confirmed = window.confirm(
      `Push weighted pipeline to Sales Forecast?\n\n` +
        `Shingle: ${shingleTotal.toFixed(0)} total SQs → ${weeklyShingle} SQs/week\n` +
        `Metal:   ${metalTotal.toFixed(0)} total SQs → ${weeklyMetal} SQs/week\n\n` +
        `Distributed evenly across ${numWeeks} weeks. This will overwrite existing values.`
    );
    if (!confirmed) return;

    setPushing(true);
    try {
      const posts: Promise<Response>[] = [];

      if (weeklyShingle > 0) {
        weeks.forEach((w) =>
          posts.push(
            fetch(`${API_BASE_URL}/api/sales-forecast`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                forecastWeek: w,
                jobType: 'shingle',
                projectedSquareFootage: weeklyShingle,
                projectedJobCount: 0,
                notes: 'HubSpot weighted pipeline',
              }),
            })
          )
        );
      }

      if (weeklyMetal > 0) {
        weeks.forEach((w) =>
          posts.push(
            fetch(`${API_BASE_URL}/api/sales-forecast`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                forecastWeek: w,
                jobType: 'metal',
                projectedSquareFootage: weeklyMetal,
                projectedJobCount: 0,
                notes: 'HubSpot weighted pipeline',
              }),
            })
          )
        );
      }

      await Promise.all(posts);
      alert('Sales forecast updated! Refresh the Sales Forecast table to see the changes.');
    } catch (err) {
      console.error('Error pushing to sales forecast:', err);
      alert('Failed to push to sales forecast. Check console for details.');
    } finally {
      setPushing(false);
    }
  };

  /**
   * Push ticket pipeline SQs to the sales forecast.
   * Ticket SQs represent jobs already in production — push the total
   * into the current week only (they're imminent, not spread over 6 months).
   */
  const handlePushTicketsToForecast = async () => {
    if (!roofingSquares) return;
    const { shingles, metal } = roofingSquares;

    if (shingles === 0 && metal === 0) {
      alert('No ticket SQs to push — no production tickets found.');
      return;
    }

    const weeks = getForecastWeeks();
    const numWeeks = weeks.length;
    const weeklyShingle = Math.round(shingles / numWeeks);
    const weeklyMetal   = Math.round(metal   / numWeeks);

    const confirmed = window.confirm(
      `Push ticket pipeline SQs to Sales Forecast?\n\n` +
        `Shingle: ${shingles.toFixed(0)} total SQs → ${weeklyShingle} SQs/week\n` +
        `Metal:   ${metal.toFixed(0)} total SQs → ${weeklyMetal} SQs/week\n\n` +
        `Distributed evenly across ${numWeeks} weeks. This will overwrite existing values.`
    );
    if (!confirmed) return;

    setPushingTickets(true);
    try {
      const posts: Promise<Response>[] = [];

      if (weeklyShingle > 0) {
        weeks.forEach((w) =>
          posts.push(
            fetch(`${API_BASE_URL}/api/sales-forecast`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                forecastWeek: w,
                jobType: 'shingle',
                projectedSquareFootage: weeklyShingle,
                projectedJobCount: 0,
                notes: 'HubSpot ticket pipeline',
              }),
            })
          )
        );
      }

      if (weeklyMetal > 0) {
        weeks.forEach((w) =>
          posts.push(
            fetch(`${API_BASE_URL}/api/sales-forecast`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                forecastWeek: w,
                jobType: 'metal',
                projectedSquareFootage: weeklyMetal,
                projectedJobCount: 0,
                notes: 'HubSpot ticket pipeline',
              }),
            })
          )
        );
      }

      await Promise.all(posts);
      alert('Sales forecast updated with ticket pipeline SQs! Refresh the Sales Forecast table to see the changes.');
    } catch (err) {
      console.error('Error pushing ticket SQs to sales forecast:', err);
      alert('Failed to push ticket SQs. Check console for details.');
    } finally {
      setPushingTickets(false);
    }
  };

  const handleAssignType = (hubspotId: string, newType: 'shingle' | 'metal') => {
    setDeals(
      deals.map((d) =>
        d.hubspot_id === hubspotId
          ? {
              ...d,
              job_type: newType,
              gross_value: d.roof_sqs * (newType === 'metal' ? REVENUE_PER_SQ.metal : REVENUE_PER_SQ.shingles),
              weighted_value: d.roof_sqs * (newType === 'metal' ? REVENUE_PER_SQ.metal : REVENUE_PER_SQ.shingles) * CLOSING_RATE,
              estimated_sqs: d.roof_sqs * CLOSING_RATE,
            }
          : d
      )
    );
  };

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-yellow-800">{error}</p>
        <button
          onClick={loadHubSpotPipeline}
          className="mt-2 px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  const filteredDeals =
    selectedType === 'all' ? deals : deals.filter((d) => d.job_type === selectedType);

  const totalWeightedValue = filteredDeals.reduce((s, d) => s + d.weighted_value, 0);
  const totalWeightedSqs = filteredDeals.reduce((s, d) => s + d.estimated_sqs, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">HubSpot Pipeline — Contract Sent</h3>
        <div className="flex gap-2">
          <button
            onClick={handlePushToSalesForecast}
            disabled={pushing || loading || deals.length === 0}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
          >
            {pushing ? 'Pushing…' : '↓ Push to Sales Forecast'}
          </button>
          <button
            onClick={loadHubSpotPipeline}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Deal summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-blue-50 p-4 rounded border border-blue-200">
          <p className="text-sm text-blue-600 font-medium">Deals</p>
          <p className="text-2xl font-bold text-blue-900">{filteredDeals.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded border border-green-200">
          <p className="text-sm text-green-600 font-medium">Weighted Value</p>
          <p className="text-2xl font-bold text-green-900">
            ${((totalWeightedValue ?? 0) / 1000).toFixed(1)}K
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded border border-purple-200">
          <p className="text-sm text-purple-600 font-medium">Projected SQs</p>
          <p className="text-2xl font-bold text-purple-900">{(totalWeightedSqs ?? 0).toFixed(0)}</p>
        </div>
      </div>

      {/* Ticket pipeline SQs (live from all production stages) */}
      {roofingSquares && (roofingSquares.metal > 0 || roofingSquares.shingles > 0) && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Ticket Pipeline — Live SQs Across All Production Stages
            </p>
            <button
              onClick={handlePushTicketsToForecast}
              disabled={pushingTickets || loading}
              className="px-3 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-700 disabled:opacity-50 font-medium"
            >
              {pushingTickets ? 'Pushing…' : '↓ Push to Sales Forecast'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-cyan-50 p-3 rounded border border-cyan-200">
              <p className="text-xs text-cyan-600 font-medium">Shingle SQs</p>
              <p className="text-xl font-bold text-cyan-900">
                {roofingSquares.shingles.toFixed(0)}
              </p>
            </div>
            <div className="bg-orange-50 p-3 rounded border border-orange-200">
              <p className="text-xs text-orange-600 font-medium">Metal SQs</p>
              <p className="text-xl font-bold text-orange-900">
                {roofingSquares.metal.toFixed(0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Type filter */}
      <div className="mb-4 flex gap-2">
        {(['all', 'shingle', 'metal'] as const).map((type) => (
          <button
            key={type}
            onClick={() => setSelectedType(type)}
            className={`px-4 py-2 rounded font-medium text-sm ${
              selectedType === type
                ? type === 'all'
                  ? 'bg-gray-600 text-white'
                  : type === 'shingle'
                  ? 'bg-cyan-600 text-white'
                  : 'bg-pink-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {type === 'all' ? 'All Types' : type === 'shingle' ? 'Shingles' : 'Metal'}
          </button>
        ))}
      </div>

      {/* Deals table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading HubSpot deals…</div>
      ) : filteredDeals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No deals in pipeline</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Deal Name</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">Job Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Roof SQs</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Gross Value</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Weighted Value (×40%)</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Est. SQs (×40%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDeals.map((deal) => (
                <tr key={deal.hubspot_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{deal.dealname}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        deal.job_type === 'shingle'
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'bg-pink-100 text-pink-800'
                      }`}
                    >
                      {deal.job_type === 'shingle' ? 'Shingle' : 'Metal'}
                    </span>
                    {/* Allow re-assignment if needed */}
                    <button
                      onClick={() =>
                        handleAssignType(
                          deal.hubspot_id,
                          deal.job_type === 'shingle' ? 'metal' : 'shingle'
                        )
                      }
                      className="ml-2 text-xs text-gray-400 hover:text-gray-600 underline"
                      title="Toggle job type"
                    >
                      switch
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {deal.roof_sqs}
                    {deal.using_default_sqs && (
                      <span className="ml-1 text-xs text-gray-400 italic" title="Sales hasn't entered roof squares yet — using 30 SQ default">est.</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    ${(deal.gross_value ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">
                    ${(deal.weighted_value ?? 0).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">
                    {(deal.estimated_sqs ?? 0).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
        Roof SQs: actual value from HubSpot, or <strong>30 SQ default</strong> until sales enters it (<em>est.</em> label).{' '}
        Gross Value = Roof SQs × per-SQ price (Shingle ${REVENUE_PER_SQ.shingles}/SQ · Metal ${REVENUE_PER_SQ.metal}/SQ).{' '}
        Weighted Value = Gross Value × {(CLOSING_RATE * 100).toFixed(0)}% closing rate.{' '}
        Est. SQs = Roof SQs × {(CLOSING_RATE * 100).toFixed(0)}%.{' '}
        <strong>Push to Sales Forecast</strong> distributes estimated SQs evenly across all 26 weeks.
      </div>
    </div>
  );
}
