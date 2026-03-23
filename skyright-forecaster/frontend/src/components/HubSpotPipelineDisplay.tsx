import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { useAuthStore } from '../store/authStore';
import { CLOSING_RATE, CREW_TYPE_RATIOS, REVENUE_PER_SQ } from '../constants/businessConstants';

interface HubSpotDeal {
  hubspot_id: string;
  dealname: string;
  amount: number;
  inferred_job_type: 'shingle' | 'metal' | 'unassigned';
  weighted_value: number;
  estimated_sqs: number;
}

interface PipelineData {
  deals: HubSpotDeal[];
  totalWeightedValue: number;
  totalWeightedSqs: number;
}

export default function HubSpotPipelineDisplay() {
  const { token } = useAuthStore();
  const [deals, setDeals] = useState<HubSpotDeal[]>([]);
  const [loading, setLoading] = useState(false);
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
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 401) {
          setError('HubSpot not connected. Please authorize first.');
        } else {
          setError('Failed to load HubSpot pipeline');
        }
        return;
      }

      const data = await res.json();
      setDeals(data.data?.deals || []);
    } catch (err) {
      setError('Error loading HubSpot pipeline');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDeals = selectedType === 'all'
    ? deals
    : deals.filter(d => d.inferred_job_type === selectedType);

  const totalWeightedValue = filteredDeals.reduce((sum, d) => sum + d.weighted_value, 0);
  const totalWeightedSqs = filteredDeals.reduce((sum, d) => sum + d.estimated_sqs, 0);
  const totalRevenue = totalWeightedSqs * (selectedType === 'metal' ? REVENUE_PER_SQ.metal : REVENUE_PER_SQ.shingles);

  const handleAssignType = async (hubspotId: string, newType: 'shingle' | 'metal') => {
    // Update the deal type locally (in a real app, would call backend to persist)
    setDeals(deals.map(d =>
      d.hubspot_id === hubspotId
        ? {
            ...d,
            inferred_job_type: newType,
            weighted_value: d.amount * CLOSING_RATE * (newType === 'metal' ? CREW_TYPE_RATIOS.metal : CREW_TYPE_RATIOS.shingles),
            estimated_sqs: (d.amount * CLOSING_RATE * (newType === 'metal' ? CREW_TYPE_RATIOS.metal : CREW_TYPE_RATIOS.shingles)) / (newType === 'metal' ? REVENUE_PER_SQ.metal : REVENUE_PER_SQ.shingles),
          }
        : d
    ));
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

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-bold text-gray-900">HubSpot Pipeline (Weighted)</h3>
        <button
          onClick={loadHubSpotPipeline}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded border border-blue-200">
          <p className="text-sm text-blue-600 font-medium">Deals</p>
          <p className="text-2xl font-bold text-blue-900">{filteredDeals.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded border border-green-200">
          <p className="text-sm text-green-600 font-medium">Weighted Value</p>
          <p className="text-2xl font-bold text-green-900">${(totalWeightedValue / 1000).toFixed(1)}K</p>
        </div>
        <div className="bg-purple-50 p-4 rounded border border-purple-200">
          <p className="text-sm text-purple-600 font-medium">Projected SQs</p>
          <p className="text-2xl font-bold text-purple-900">{totalWeightedSqs.toFixed(0)}</p>
        </div>
      </div>

      {/* Type Filter */}
      <div className="mb-4 flex gap-2">
        {['all', 'shingle', 'metal'].map(type => (
          <button
            key={type}
            onClick={() => setSelectedType(type as 'all' | 'shingle' | 'metal')}
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

      {/* Deals Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading HubSpot deals...</div>
      ) : filteredDeals.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No deals in pipeline</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Deal Name</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Amount</th>
                <th className="px-4 py-3 text-center font-medium text-gray-700">Job Type</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Weighted Value</th>
                <th className="px-4 py-3 text-right font-medium text-gray-700">Est. SQs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredDeals.map((deal) => (
                <tr key={deal.hubspot_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-900 font-medium">{deal.dealname}</td>
                  <td className="px-4 py-3 text-right text-gray-900">${(deal.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-center">
                    {deal.inferred_job_type === 'unassigned' ? (
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleAssignType(deal.hubspot_id, 'shingle')}
                          className="px-2 py-1 text-xs bg-cyan-100 text-cyan-800 rounded hover:bg-cyan-200"
                        >
                          Shingle
                        </button>
                        <button
                          onClick={() => handleAssignType(deal.hubspot_id, 'metal')}
                          className="px-2 py-1 text-xs bg-pink-100 text-pink-800 rounded hover:bg-pink-200"
                        >
                          Metal
                        </button>
                      </div>
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        deal.inferred_job_type === 'shingle'
                          ? 'bg-cyan-100 text-cyan-800'
                          : 'bg-pink-100 text-pink-800'
                      }`}>
                        {deal.inferred_job_type}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">
                    ${deal.weighted_value.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">{deal.estimated_sqs.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-sm text-gray-600">
          Total Weighted Revenue: <span className="font-bold text-gray-900">${totalRevenue.toLocaleString()}</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Calculation: Deal Amount × {(CLOSING_RATE * 100).toFixed(0)}% Closing Rate × Type Ratio
        </p>
      </div>
    </div>
  );
}
