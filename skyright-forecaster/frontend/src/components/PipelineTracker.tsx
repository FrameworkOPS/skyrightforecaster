import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../utils/apiConfig';

interface PipelineItem {
  id: string;
  job_type: string;
  square_footage: number;
  estimated_days_to_completion: number;
  revenue_per_sq: number;
  total_revenue: number;
  status: string;
  added_date: string;
  target_start_date: string | null;
  notes: string | null;
  is_active: boolean;
}

interface CrewCapacity {
  id: string;
  crew_type: string;
  sqs_per_week: number;
}

interface PipelineSummary {
  shingles?: { totalSQs: number; jobCount: number };
  metal?: { totalSQs: number; jobCount: number };
  combined?: { totalSQs: number; jobCount: number };
}


export default function PipelineTracker() {
  const { token } = useAuthStore();
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingPipeline, setSavingPipeline] = useState(false);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [showPipelineForm, setShowPipelineForm] = useState(false);
  const [showCrewForm, setShowCrewForm] = useState(false);
  const [crews, setCrews] = useState<CrewCapacity[]>([]);
  const [pipelineData, setPipelineData] = useState({
    shinglesSQS: '',
    metalSQS: '',
  });
  const [crewFormData, setCrewFormData] = useState({
    crew_type: 'shingle',
    sqs_per_week: '',
  });

  useEffect(() => {
    loadSummary();
    loadCrews();
  }, []);

  const loadCrews = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/crews?active=true`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        // Transform crews data to include SQS per week (default values for now)
        const crewsWithCapacity: CrewCapacity[] = (data.data || []).map((crew: any) => ({
          id: crew.id,
          crew_type: crew.crew_type,
          sqs_per_week: 100, // Default, can be updated
        }));
        setCrews(crewsWithCapacity);
      }
    } catch (error) {
      console.error('Error loading crews:', error);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/pipeline/summary`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setSummary(data.data);
      }
    } catch (error) {
      console.error('Error loading summary:', error);
    }
  };

  const MANUAL_NOTE = 'Manual pipeline input';

  const handleSavePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPipeline(true);
    setPipelineError(null);

    const today = new Date().toISOString().split('T')[0];

    try {
      // Fetch existing items to find any prior manual entries to update
      const listRes = await fetch(`${API_BASE_URL}/api/pipeline?activeOnly=true&limit=200`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const listData = listRes.ok ? await listRes.json() : { data: [] };
      const existingItems: PipelineItem[] = listData.data || [];

      const manualShingle = existingItems.find(
        (item) => item.job_type === 'shingle' && item.notes === MANUAL_NOTE
      );
      const manualMetal = existingItems.find(
        (item) => item.job_type === 'metal' && item.notes === MANUAL_NOTE
      );

      const saves: Promise<Response>[] = [];

      const shingleSQs = parseFloat(pipelineData.shinglesSQS);
      if (!isNaN(shingleSQs) && shingleSQs > 0) {
        if (manualShingle) {
          saves.push(
            fetch(`${API_BASE_URL}/api/pipeline/${manualShingle.id}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ squareFootage: shingleSQs, revenuePerSq: 600 }),
            })
          );
        } else {
          saves.push(
            fetch(`${API_BASE_URL}/api/pipeline`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobType: 'shingle',
                squareFootage: shingleSQs,
                estimatedDaysToCompletion: 5,
                revenuePerSq: 600,
                addedDate: today,
                notes: MANUAL_NOTE,
              }),
            })
          );
        }
      }

      const metalSQs = parseFloat(pipelineData.metalSQS);
      if (!isNaN(metalSQs) && metalSQs > 0) {
        if (manualMetal) {
          saves.push(
            fetch(`${API_BASE_URL}/api/pipeline/${manualMetal.id}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ squareFootage: metalSQs, revenuePerSq: 1000 }),
            })
          );
        } else {
          saves.push(
            fetch(`${API_BASE_URL}/api/pipeline`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jobType: 'metal',
                squareFootage: metalSQs,
                estimatedDaysToCompletion: 7,
                revenuePerSq: 1000,
                addedDate: today,
                notes: MANUAL_NOTE,
              }),
            })
          );
        }
      }

      if (saves.length === 0) {
        setPipelineError('Please enter at least one SQ value greater than 0');
        return;
      }

      const results = await Promise.all(saves);
      const failed = results.find((r) => !r.ok);
      if (failed) {
        const errData = await failed.json().catch(() => ({}));
        setPipelineError(errData.error || errData.message || `Failed to save pipeline (${failed.status})`);
      } else {
        setShowPipelineForm(false);
        setPipelineData({ shinglesSQS: '', metalSQS: '' });
        loadSummary();
      }
    } catch (err) {
      setPipelineError(err instanceof Error ? err.message : 'An error occurred while saving');
    } finally {
      setSavingPipeline(false);
    }
  };

  const handleAddCrew = async (e: React.FormEvent) => {
    e.preventDefault();

    const newCrew: CrewCapacity = {
      id: Date.now().toString(),
      crew_type: crewFormData.crew_type,
      sqs_per_week: parseFloat(crewFormData.sqs_per_week),
    };

    setCrews([...crews, newCrew]);
    setShowCrewForm(false);
    setCrewFormData({
      crew_type: 'shingle',
      sqs_per_week: '',
    });
  };

  const handleDeleteCrew = (id: string) => {
    if (confirm('Are you sure you want to remove this crew?')) {
      setCrews(crews.filter(crew => crew.id !== id));
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Pipeline Tracker</h2>
        <button
          onClick={async () => {
            if (showPipelineForm) {
              setShowPipelineForm(false);
              setPipelineError(null);
            } else {
              // Pre-populate with existing manual values
              try {
                const res = await fetch(`${API_BASE_URL}/api/pipeline?activeOnly=true&limit=200`, {
                  headers: { 'Authorization': `Bearer ${token}` },
                });
                if (res.ok) {
                  const data = await res.json();
                  const items: PipelineItem[] = data.data || [];
                  const shingle = items.find(i => i.job_type === 'shingle' && i.notes === 'Manual pipeline input');
                  const metal = items.find(i => i.job_type === 'metal' && i.notes === 'Manual pipeline input');
                  setPipelineData({
                    shinglesSQS: shingle ? String(shingle.square_footage) : '',
                    metalSQS: metal ? String(metal.square_footage) : '',
                  });
                }
              } catch {
                setPipelineData({ shinglesSQS: '', metalSQS: '' });
              }
              setShowPipelineForm(true);
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showPipelineForm ? 'Cancel' : 'Update Pipeline'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {summary && (
          <>
            {summary.shingles && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm font-medium text-blue-600">Shingle Pipeline</p>
                <p className="text-2xl font-bold text-blue-900">{summary.shingles.totalSQs?.toFixed(0) || 0} SQs</p>
                <p className="text-xs text-blue-700">{summary.shingles.jobCount || 0} jobs</p>
              </div>
            )}
            {summary.metal && (
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <p className="text-sm font-medium text-red-600">Metal Pipeline</p>
                <p className="text-2xl font-bold text-red-900">{summary.metal.totalSQs?.toFixed(0) || 0} SQs</p>
                <p className="text-xs text-red-700">{summary.metal.jobCount || 0} jobs</p>
              </div>
            )}
            {summary.combined && (
              <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                <p className="text-sm font-medium text-purple-600">Total Pipeline</p>
                <p className="text-2xl font-bold text-purple-900">${(summary.combined.totalSQs || 0).toFixed(0)}</p>
                <p className="text-xs text-purple-700">{summary.combined.jobCount || 0} total jobs</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Pipeline Input Form */}
      {showPipelineForm && (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
          <h3 className="text-lg font-semibold mb-2">Update Pipeline Inventory</h3>
          <p className="text-xs text-gray-500 mb-4">Set the current SQ counts in your pipeline. Saving will update existing manual entries or create new ones.</p>
          {pipelineError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded p-3 flex justify-between items-start">
              <p className="text-sm text-red-700">{pipelineError}</p>
              <button onClick={() => setPipelineError(null)} className="text-red-500 hover:text-red-700 ml-2 text-xs underline">Dismiss</button>
            </div>
          )}
          <form onSubmit={handleSavePipeline} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SQS of Shingles</label>
                <input
                  type="number"
                  value={pipelineData.shinglesSQS}
                  onChange={(e) => setPipelineData({ ...pipelineData, shinglesSQS: e.target.value })}
                  placeholder="e.g., 5000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SQS of Metal</label>
                <input
                  type="number"
                  value={pipelineData.metalSQS}
                  onChange={(e) => setPipelineData({ ...pipelineData, metalSQS: e.target.value })}
                  placeholder="e.g., 3000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowPipelineForm(false);
                  setPipelineError(null);
                  setPipelineData({ shinglesSQS: '', metalSQS: '' });
                }}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPipeline}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPipeline ? 'Saving...' : 'Update Pipeline'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Crews Section */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Crews Capacity</h3>
          <button
            onClick={() => setShowCrewForm(!showCrewForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {showCrewForm ? 'Cancel' : 'Add Crew'}
          </button>
        </div>

        {showCrewForm && (
          <form onSubmit={handleAddCrew} className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={crewFormData.crew_type}
                  onChange={(e) => setCrewFormData({ ...crewFormData, crew_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="shingle">Shingle</option>
                  <option value="metal">Metal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SQS per Week</label>
                <input
                  type="number"
                  value={crewFormData.sqs_per_week}
                  onChange={(e) => setCrewFormData({ ...crewFormData, sqs_per_week: e.target.value })}
                  placeholder="e.g., 500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowCrewForm(false);
                  setCrewFormData({ crew_type: 'shingle', sqs_per_week: '' });
                }}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Crew
              </button>
            </div>
          </form>
        )}

        {crews.length === 0 ? (
          <p className="text-center py-6 text-gray-500">No crews added yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">SQS per Week</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {crews.map((crew) => (
                  <tr key={crew.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${crew.crew_type === 'shingle' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                        {crew.crew_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{crew.sqs_per_week}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <button
                        onClick={() => handleDeleteCrew(crew.id)}
                        className="text-red-600 hover:text-red-800 font-medium"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
