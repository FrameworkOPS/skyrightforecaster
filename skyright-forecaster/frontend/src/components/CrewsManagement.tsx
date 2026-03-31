import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../utils/apiConfig';

interface Crew {
  id: string;
  crew_name: string;
  crew_type: 'shingle' | 'metal';
  team_members: number;
  training_period_days: number;
  start_date: string;
  terminate_date?: string;
  revenue_per_sq: number;
  weekly_sq_capacity: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface CrewFormData {
  crew_name: string;
  crew_type: 'shingle' | 'metal';
  team_members: number;
  training_period_days: number;
  start_date: string;
  terminate_date?: string;
  revenue_per_sq?: number;
  weekly_sq_capacity?: number;
}

interface CrewStaff {
  crew_id: string;
  lead_count: number;
  super_count: number;
}

interface StaffFormData {
  leadCount: number;
  superCount: number;
}

export default function CrewsManagement() {
  const { token } = useAuthStore();
  const [crews, setCrews] = useState<Crew[]>([]);
  const [staffData, setStaffData] = useState<Record<string, CrewStaff>>({});
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormData>({ leadCount: 0, superCount: 0 });
  const [savingStaff, setSavingStaff] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CrewFormData>({
    crew_name: '',
    crew_type: 'shingle',
    team_members: 1,
    training_period_days: 28,
    start_date: new Date().toISOString().split('T')[0],
    revenue_per_sq: 600,
    weekly_sq_capacity: 200,
  });

  useEffect(() => {
    loadCrews();
  }, []);

  const loadStaff = async (crewList: Crew[]) => {
    const entries = await Promise.all(
      crewList.map(async (crew) => {
        const res = await fetch(`${API_BASE_URL}/api/crew-staff/crew/${crew.id}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          return [crew.id, { crew_id: crew.id, lead_count: data.data.lead_count ?? 0, super_count: data.data.super_count ?? 0 }] as [string, CrewStaff];
        }
        return [crew.id, { crew_id: crew.id, lead_count: 0, super_count: 0 }] as [string, CrewStaff];
      })
    );
    setStaffData(Object.fromEntries(entries));
  };

  const handleSaveStaff = async (crewId: string) => {
    setSavingStaff(true);
    try {
      const today = new Date();
      const addedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const res = await fetch(`${API_BASE_URL}/api/crew-staff`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crewId,
          leadCount: staffForm.leadCount,
          superCount: staffForm.superCount,
          addedDate,
        }),
      });
      if (res.ok) {
        setStaffData(prev => ({
          ...prev,
          [crewId]: { crew_id: crewId, lead_count: staffForm.leadCount, super_count: staffForm.superCount },
        }));
        setEditingStaffId(null);
      }
    } catch (err) {
      console.error('Error saving staff:', err);
    } finally {
      setSavingStaff(false);
    }
  };

  const loadCrews = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/crews?active=true`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        const crewList = data.data || [];
        setCrews(crewList);
        await loadStaff(crewList);
      }
    } catch (error) {
      console.error('Error loading crews:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCrew = async () => {
    setError(null);
    setSaving(true);
    try {
      const url = editingId ? `${API_BASE_URL}/api/crews/${editingId}` : `${API_BASE_URL}/api/crews`;
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        setFormData({
          crew_name: '',
          crew_type: 'shingle',
          team_members: 1,
          training_period_days: 28,
          start_date: new Date().toISOString().split('T')[0],
          revenue_per_sq: 600,
          weekly_sq_capacity: 200,
        });
        loadCrews();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || data.message || `Failed to save crew (${res.status})`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCrew = async (crewId: string) => {
    if (!confirm('Are you sure you want to delete this crew?')) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/crews/${crewId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        loadCrews();
      }
    } catch (error) {
      console.error('Error deleting crew:', error);
    }
  };

  const handleEditCrew = (crew: Crew) => {
    setFormData({
      crew_name: crew.crew_name,
      crew_type: crew.crew_type,
      team_members: crew.team_members,
      training_period_days: crew.training_period_days,
      start_date: crew.start_date?.split('T')[0] ?? crew.start_date,
      terminate_date: crew.terminate_date?.split('T')[0] ?? crew.terminate_date,
      revenue_per_sq: crew.revenue_per_sq,
      weekly_sq_capacity: crew.weekly_sq_capacity ?? (crew.crew_type === 'shingle' ? 200 : 100),
    });
    setEditingId(crew.id);
    setShowForm(true);
  };

  const handleCrewTypeChange = (type: 'shingle' | 'metal') => {
    setFormData({
      ...formData,
      crew_type: type,
      revenue_per_sq: type === 'shingle' ? 600 : 1000,
      weekly_sq_capacity: type === 'shingle' ? 200 : 100,
    });
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-8">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Crews Management</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            if (!showForm) {
              setEditingId(null);
              setFormData({
                crew_name: '',
                crew_type: 'shingle',
                team_members: 1,
                training_period_days: 28,
                start_date: new Date().toISOString().split('T')[0],
                revenue_per_sq: 600,
                weekly_sq_capacity: 200,
              });
            }
          }}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {showForm ? 'Cancel' : 'Add Crew'}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 flex justify-between items-start">
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 ml-2 text-xs underline">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-gray-50 p-4 rounded mb-6 border border-gray-200">
          <h3 className="text-lg font-bold mb-4 text-gray-900">
            {editingId ? 'Edit Crew' : 'New Crew'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Crew Name *</label>
              <input
                type="text"
                value={formData.crew_name}
                onChange={(e) => setFormData({ ...formData, crew_name: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., Shingle Team A"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Crew Type *</label>
              <select
                value={formData.crew_type}
                onChange={(e) => handleCrewTypeChange(e.target.value as 'shingle' | 'metal')}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="shingle">Shingle (Fast Ramp: 30% loss)</option>
                <option value="metal">Metal (Slow Ramp: 60% loss)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Team Members *</label>
              <input
                type="number"
                value={formData.team_members}
                onChange={(e) =>
                  setFormData({ ...formData, team_members: parseInt(e.target.value) })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Training Period (days) *
              </label>
              <input
                type="number"
                value={formData.training_period_days}
                onChange={(e) =>
                  setFormData({ ...formData, training_period_days: parseInt(e.target.value) })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Start Date *</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Revenue per Sq ($) *
              </label>
              <input
                type="number"
                value={formData.revenue_per_sq}
                onChange={(e) =>
                  setFormData({ ...formData, revenue_per_sq: parseFloat(e.target.value) })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                min="0"
                step="50"
              />
              <p className="text-xs text-gray-500 mt-1">
                Default: $600 shingle, $1000 metal
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Weekly SQ Capacity *
              </label>
              <input
                type="number"
                value={formData.weekly_sq_capacity}
                onChange={(e) =>
                  setFormData({ ...formData, weekly_sq_capacity: parseFloat(e.target.value) })
                }
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
                step="10"
              />
              <p className="text-xs text-gray-500 mt-1">
                SQs this crew produces per week at full capacity. Default: 200 shingle, 100 metal
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={handleSaveCrew}
              disabled={saving}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : (editingId ? 'Update' : 'Create') + ' Crew'}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-600">Loading crews...</div>
      ) : crews.length === 0 ? (
        <div className="text-center py-8 text-gray-600">No crews yet. Add one to get started.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Team Size</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Training (days)
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Start Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                  Terminate Date
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">$/sq</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">SQs/wk</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Staff</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {crews.map((crew) => (
                <tr key={crew.id} className="border-t hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{crew.crew_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        crew.crew_type === 'shingle'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {crew.crew_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{crew.team_members}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{crew.training_period_days}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{crew.start_date}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {crew.terminate_date || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    ${crew.revenue_per_sq.toFixed(0)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {crew.weekly_sq_capacity != null ? crew.weekly_sq_capacity.toFixed(0) : '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 min-w-48">
                    {editingStaffId === crew.id ? (
                      <div className="space-y-2">
                        {crew.crew_type === 'shingle' ? (
                          <div>
                            <label className="text-xs text-gray-600">Site Supervisors</label>
                            <input
                              type="number"
                              min="0"
                              value={staffForm.superCount}
                              onChange={(e) => setStaffForm(prev => ({ ...prev, superCount: parseInt(e.target.value) || 0 }))}
                              className="mt-1 block w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        ) : (
                          <div>
                            <label className="text-xs text-gray-600">Crew Leads</label>
                            <input
                              type="number"
                              min="0"
                              value={staffForm.leadCount}
                              onChange={(e) => setStaffForm(prev => ({ ...prev, leadCount: parseInt(e.target.value) || 0 }))}
                              className="mt-1 block w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                            />
                          </div>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleSaveStaff(crew.id)}
                            disabled={savingStaff}
                            className="px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 disabled:opacity-50"
                          >
                            {savingStaff ? '...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingStaffId(null)}
                            className="px-2 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-700">
                          {crew.crew_type === 'shingle'
                            ? `Sups: ${staffData[crew.id]?.super_count ?? 0}`
                            : `Leads: ${staffData[crew.id]?.lead_count ?? 0}`}
                        </span>
                        <button
                          onClick={() => {
                            const s = staffData[crew.id];
                            setStaffForm({ leadCount: s?.lead_count ?? 0, superCount: s?.super_count ?? 0 });
                            setEditingStaffId(crew.id);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Update
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <button
                      onClick={() => handleEditCrew(crew)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCrew(crew.id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
