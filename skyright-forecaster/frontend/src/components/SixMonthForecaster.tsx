import React, { useState, useEffect } from 'react';
import { API_BASE_URL } from '../utils/apiConfig';
import { useAuthStore } from '../store/authStore';
import { LEAD_TIME_THRESHOLDS, getLeadTimeStatus, getLeadTimeColorClass } from '../constants/businessConstants';

interface CrewEvent {
  type: 'added' | 'removed';
  crew_name: string;
  crew_type: string;
  date: string;
}

interface ForecastWeek {
  week: string;
  pipeline_sqs_shingles: number;
  pipeline_sqs_metal: number;
  production_rate_shingles: number;
  production_rate_metal: number;
  sales_forecast_shingles: number;
  sales_forecast_metal: number;
  avg_lead_time_weeks: number;
  crew_changes: CrewEvent[];
  custom_projects: Array<{ name: string; start_date: string; end_date: string }>;
}

interface ForecastData {
  weeks: ForecastWeek[];
}

type ForecastDuration = '3' | '6' | '9';

export default function SixMonthForecaster() {
  const { token } = useAuthStore();
  const [forecastData, setForecastData] = useState<ForecastWeek[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState<'all' | 'shingle' | 'metal'>('all');
  const [duration, setDuration] = useState<ForecastDuration>('6');

  useEffect(() => {
    loadForecast();
  }, [duration]);

  const getDurationWeeks = (d: ForecastDuration): number => {
    switch (d) {
      case '3': return 13;
      case '6': return 26;
      case '9': return 39;
    }
  };

  const loadForecast = async () => {
    setLoading(true);
    try {
      const weeks = getDurationWeeks(duration);
      const res = await fetch(`${API_BASE_URL}/api/forecasts/six-month?weeks=${weeks}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setForecastData(data.data?.weeks || []);
      }
    } catch (error) {
      console.error('Error loading forecast:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWeekLabel = (weekStr: string): string => {
    return new Date(weekStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Production Forecast</h2>
        <button
          onClick={loadForecast}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Duration Selector */}
      <div className="flex gap-2 items-center">
        <span className="text-sm font-medium text-gray-700 mr-2">Duration:</span>
        {(['3', '6', '9'] as ForecastDuration[]).map((d) => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            className={`px-4 py-2 rounded font-medium text-sm ${
              duration === d
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {d} Month
          </button>
        ))}
      </div>

      {/* Type Filter */}
      <div className="flex gap-2">
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

      {/* Forecast Table */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading forecast...</div>
      ) : forecastData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No forecast data available. Ensure crews and pipeline data are configured.</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-700 min-w-20">Week</th>
                {(selectedType === 'all' || selectedType === 'shingle') && (
                  <>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Pipe SQs (S)</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Prod Rate (S)</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Sales (S)</th>
                  </>
                )}
                {(selectedType === 'all' || selectedType === 'metal') && (
                  <>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Pipe SQs (M)</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Prod Rate (M)</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Sales (M)</th>
                  </>
                )}
                <th className="px-4 py-3 text-center font-medium text-gray-700">Lead Time</th>
                <th className="px-4 py-3 text-left font-medium text-gray-700">Events</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {forecastData.map((week) => {
                const leadTimeStatus = getLeadTimeStatus(week.avg_lead_time_weeks);
                const colorClass = getLeadTimeColorClass(leadTimeStatus);
                const hasEvents = week.crew_changes.length > 0 || week.custom_projects.length > 0;

                return (
                  <tr key={week.week} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {getWeekLabel(week.week)}
                    </td>
                    {(selectedType === 'all' || selectedType === 'shingle') && (
                      <>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {week.pipeline_sqs_shingles.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {week.production_rate_shingles.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {week.sales_forecast_shingles.toFixed(0)}
                        </td>
                      </>
                    )}
                    {(selectedType === 'all' || selectedType === 'metal') && (
                      <>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {week.pipeline_sqs_metal.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {week.production_rate_metal.toFixed(0)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          {week.sales_forecast_metal.toFixed(0)}
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-semibold text-center block ${colorClass}`}>
                        {week.avg_lead_time_weeks}w
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {hasEvents ? (
                        <div className="space-y-1">
                          {week.crew_changes.map((event, idx) => (
                            <span
                              key={idx}
                              className={`block px-2 py-1 rounded ${
                                event.type === 'added'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {event.type === 'added' ? '+' : '-'} {event.crew_name} ({event.crew_type})
                            </span>
                          ))}
                          {week.custom_projects.map((proj, idx) => (
                            <span key={idx} className="block px-2 py-1 rounded bg-gray-100 text-gray-800">
                              Project: {proj.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="font-bold text-gray-900 mb-3">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <span className="inline-block px-3 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 mr-2">
              GREEN
            </span>
            <span className="text-sm text-gray-600">4-5 weeks lead time</span>
          </div>
          <div>
            <span className="inline-block px-3 py-1 rounded text-xs font-semibold bg-yellow-100 text-yellow-800 mr-2">
              YELLOW
            </span>
            <span className="text-sm text-gray-600">6-8 weeks lead time</span>
          </div>
          <div>
            <span className="inline-block px-3 py-1 rounded text-xs font-semibold bg-red-100 text-red-800 mr-2">
              RED
            </span>
            <span className="text-sm text-gray-600">8+ weeks lead time</span>
          </div>
          <div>
            <span className="text-sm">S = Shingles, M = Metal</span>
          </div>
          <div>
            <span className="text-sm">+ = Crew added, - = Crew removed</span>
          </div>
          <div>
            <span className="text-sm">Project = Custom project blocking</span>
          </div>
        </div>
      </div>
    </div>
  );
}
