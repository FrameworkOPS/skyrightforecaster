import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../utils/apiConfig';
import HubSpotPipelineDisplay from './HubSpotPipelineDisplay';

interface SalesForecast {
  forecast_week: string;
  job_type: string;
  projected_square_footage: number;
  projected_job_count?: number;
  notes?: string;
}


export default function SalesForecastInput() {
  const { token } = useAuthStore();
  const [forecasts, setForecasts] = useState<SalesForecast[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<'shingle' | 'metal' | 'all'>('all');
  const [startWeek, setStartWeek] = useState('');
  const [endWeek, setEndWeek] = useState('');
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    projectedSquareFootage: '',
    projectedJobCount: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Initialize default week range (12 weeks from now)
    const today = new Date();
    const startDate = getMonday(today);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 182); // 6 months (~26 weeks)

    setStartWeek(formatDate(startDate));
    setEndWeek(formatDate(endDate));
    loadForecasts(formatDate(startDate), formatDate(endDate));
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

  const getNextMonday = (dateStr: string): string => {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 7);
    return formatDate(date);
  };

  const loadForecasts = async (start: string, end: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (start) params.append('startWeek', start);
      if (end) params.append('endWeek', end);

      const res = await fetch(`${API_BASE_URL}/api/sales-forecast?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setForecasts(data.data || []);
      }
    } catch (error) {
      console.error('Error loading forecasts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (week: string, jobType: string) => {
    setError(null);

    // Validate input
    const sqValue = parseFloat(formData.projectedSquareFootage);
    if (!formData.projectedSquareFootage || isNaN(sqValue) || sqValue <= 0) {
      setError('Please enter a valid square footage value');
      return;
    }

    try {
      const payload = {
        forecastWeek: week,
        jobType: jobType,
        projectedSquareFootage: sqValue,
        projectedJobCount: parseInt(formData.projectedJobCount) || 0,
        notes: formData.notes || null,
      };

      console.log('Saving forecast payload:', payload);

      const res = await fetch(`${API_BASE_URL}/api/sales-forecast`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('API response status:', res.status);
      const responseData = await res.json();
      console.log('API response data:', responseData);

      if (res.ok) {
        setEditingWeek(null);
        setEditingType(null);
        setFormData({ projectedSquareFootage: '', projectedJobCount: '', notes: '' });
        await loadForecasts(startWeek, endWeek);
      } else {
        const errorMsg = responseData.message || `Failed to save forecast (${res.status})`;
        setError(errorMsg);
        console.error('Error saving forecast:', errorMsg);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'An error occurred while saving';
      setError(errorMsg);
      console.error('Error saving forecast:', error);
    }
  };

  const handleCopyPreviousWeek = async (fromWeek: string, toWeek: string, jobType: string) => {
    const sourceValue = getValue(fromWeek, jobType);
    if (sourceValue <= 0) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/sales-forecast`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          forecastWeek: toWeek,
          jobType,
          projectedSquareFootage: sourceValue,
          projectedJobCount: 0,
          notes: null,
        }),
      });
      if (res.ok) {
        await loadForecasts(startWeek, endWeek);
      }
    } catch (error) {
      console.error('Error copying week:', error);
    }
  };

  const handleCopyAllWeeks = async (jobType: 'shingle' | 'metal') => {
    const currentWeeks = getWeeks();
    // Use the first week that has a value set as the source
    const sourceValue = currentWeeks.map(w => getValue(w, jobType)).find(v => v > 0);
    if (!sourceValue) return;

    try {
      await Promise.all(
        currentWeeks.map(w =>
          fetch(`${API_BASE_URL}/api/sales-forecast`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              forecastWeek: w,
              jobType,
              projectedSquareFootage: sourceValue,
              projectedJobCount: 0,
              notes: null,
            }),
          })
        )
      );
      await loadForecasts(startWeek, endWeek);
    } catch (error) {
      console.error('Error copying all weeks:', error);
    }
  };

  const startEditing = (week: string, jobType: string) => {
    const existing = forecasts.find(f => f.forecast_week.substring(0, 10) === week && f.job_type === jobType);
    setFormData({
      projectedSquareFootage: existing?.projected_square_footage.toString() || '',
      projectedJobCount: existing?.projected_job_count?.toString() || '',
      notes: existing?.notes || '',
    });
    setEditingWeek(week);
    setEditingType(jobType);
  };

  const getValue = (week: string, jobType: string): number => {
    const item = forecasts.find(f => f.forecast_week.substring(0, 10) === week && f.job_type === jobType);
    return item?.projected_square_footage || 0;
  };

  const getWeeks = (): string[] => {
    const weeks: string[] = [];
    if (!startWeek || !endWeek) return weeks;

    let current = new Date(startWeek + 'T00:00:00');
    const end = new Date(endWeek + 'T00:00:00');

    while (current <= end) {
      weeks.push(formatDate(current));
      current.setDate(current.getDate() + 7);
    }

    return weeks;
  };

  const weeks = getWeeks();
  const isCurrentWeek = (week: string): boolean => {
    const today = new Date();
    const weekDate = new Date(week + 'T00:00:00');
    const daysDiff = (today.getTime() - weekDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff >= 0 && daysDiff < 7;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Sales Forecast</h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <p className="font-medium">Error:</p>
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs mt-2 text-red-600 hover:text-red-800 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* HubSpot Pipeline */}
      <HubSpotPipelineDisplay />

      {/* Week Range Selector */}
      <div className="bg-white p-4 rounded-lg border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Week</label>
            <input
              type="date"
              value={startWeek}
              onChange={(e) => {
                setStartWeek(e.target.value);
                loadForecasts(e.target.value, endWeek);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Week</label>
            <input
              type="date"
              value={endWeek}
              onChange={(e) => {
                setEndWeek(e.target.value);
                loadForecasts(startWeek, e.target.value);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Forecast Table */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {loading ? (
          <div className="px-6 py-4 text-center text-gray-500">Loading...</div>
        ) : weeks.length === 0 ? (
          <div className="px-6 py-4 text-center text-gray-500">No weeks selected</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Week</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">
                  <div className="flex items-center gap-2">
                    Shingle SQs
                    <button
                      onClick={() => handleCopyAllWeeks('shingle')}
                      title="Copy first entered shingle value to all weeks"
                      className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 font-normal"
                    >
                      Copy All
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">
                  <div className="flex items-center gap-2">
                    Metal SQs
                    <button
                      onClick={() => handleCopyAllWeeks('metal')}
                      title="Copy first entered metal value to all weeks"
                      className="px-2 py-0.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 font-normal"
                    >
                      Copy All
                    </button>
                  </div>
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Total SQs</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {weeks.map((week) => {
                const shingleValue = getValue(week, 'shingle');
                const metalValue = getValue(week, 'metal');
                const totalValue = shingleValue + metalValue;
                const isCurrent = isCurrentWeek(week);

                return (
                  <tr
                    key={week}
                    className={`${isCurrent ? 'bg-blue-50' : 'hover:bg-gray-50'} ${new Date(week) < new Date() ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {new Date(week + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                      {isCurrent && <span className="ml-2 text-xs bg-blue-600 text-white px-2 py-1 rounded">Current</span>}
                    </td>
                    <td className="px-4 py-3">
                      {editingWeek === week && editingType === 'shingle' ? (
                        <div className="space-y-2">
                          <input
                            type="number"
                            value={formData.projectedSquareFootage}
                            onChange={(e) =>
                              setFormData({ ...formData, projectedSquareFootage: e.target.value })
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                            placeholder="SQs"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSave(week, 'shingle')}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingWeek(null);
                                setEditingType(null);
                              }}
                              className="px-2 py-1 bg-gray-300 text-gray-800 text-xs rounded hover:bg-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => startEditing(week, 'shingle')}
                          className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                        >
                          {shingleValue > 0 ? shingleValue.toFixed(0) : '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingWeek === week && editingType === 'metal' ? (
                        <div className="space-y-2">
                          <input
                            type="number"
                            value={formData.projectedSquareFootage}
                            onChange={(e) =>
                              setFormData({ ...formData, projectedSquareFootage: e.target.value })
                            }
                            className="w-full px-2 py-1 border border-gray-300 rounded"
                            placeholder="SQs"
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleSave(week, 'metal')}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingWeek(null);
                                setEditingType(null);
                              }}
                              className="px-2 py-1 bg-gray-300 text-gray-800 text-xs rounded hover:bg-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => startEditing(week, 'metal')}
                          className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded"
                        >
                          {metalValue > 0 ? metalValue.toFixed(0) : '-'}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      {totalValue > 0 ? totalValue.toFixed(0) : '-'}
                    </td>
                    <td className="px-4 py-3 text-xs space-x-1">
                      <button
                        onClick={() => {
                          const d = new Date(week + 'T00:00:00');
                          d.setDate(d.getDate() - 7);
                          const prevWeek = formatDate(d);
                          handleCopyPreviousWeek(prevWeek, week, 'shingle');
                        }}
                        title="Copy previous week shingle forecast"
                        className="px-2 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200"
                      >
                        Copy Shingle
                      </button>
                      <button
                        onClick={() => {
                          const d = new Date(week + 'T00:00:00');
                          d.setDate(d.getDate() - 7);
                          const prevWeek = formatDate(d);
                          handleCopyPreviousWeek(prevWeek, week, 'metal');
                        }}
                        title="Copy previous week metal forecast"
                        className="px-2 py-1 bg-red-100 text-red-600 rounded hover:bg-red-200"
                      >
                        Copy Metal
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-xs text-gray-600">
        <p>💡 Click on any SQ value to edit. Use "Copy" buttons to quickly duplicate the previous week's forecast.</p>
      </div>
    </div>
  );
}
