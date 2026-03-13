import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

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

interface PipelineSummary {
  shingles?: { totalSQs: number; jobCount: number };
  metal?: { totalSQs: number; jobCount: number };
  combined?: { totalSQs: number; jobCount: number };
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function PipelineTracker() {
  const { token } = useAuthStore();
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([]);
  const [summary, setSummary] = useState<PipelineSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [formData, setFormData] = useState({
    jobType: 'shingle',
    squareFootage: '',
    estimatedDaysToCompletion: '',
    revenuePerSq: '600',
    status: 'pending',
    addedDate: new Date().toISOString().split('T')[0],
    targetStartDate: '',
    notes: '',
  });

  useEffect(() => {
    loadPipelineItems();
    loadSummary();
  }, []);

  const loadPipelineItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterType !== 'all') params.append('jobType', filterType);
      if (filterStatus !== 'all') params.append('status', filterStatus);

      const res = await fetch(`${API_URL}/api/pipeline?${params}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setPipelineItems(data.data || []);
      }
    } catch (error) {
      console.error('Error loading pipeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await fetch(`${API_URL}/api/pipeline/summary`, {
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      jobType: formData.jobType,
      squareFootage: parseFloat(formData.squareFootage),
      estimatedDaysToCompletion: parseInt(formData.estimatedDaysToCompletion),
      revenuePerSq: parseFloat(formData.revenuePerSq),
      status: formData.status,
      addedDate: formData.addedDate,
      targetStartDate: formData.targetStartDate || null,
      notes: formData.notes || null,
    };

    try {
      let res;
      if (editingId) {
        res = await fetch(`${API_URL}/api/pipeline/${editingId}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch(`${API_URL}/api/pipeline`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      if (res.ok) {
        setShowForm(false);
        setEditingId(null);
        resetForm();
        await loadPipelineItems();
        await loadSummary();
      } else {
        console.error('Error saving pipeline item');
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this item?')) {
      try {
        const res = await fetch(`${API_URL}/api/pipeline/${id}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (res.ok) {
          await loadPipelineItems();
          await loadSummary();
        }
      } catch (error) {
        console.error('Error deleting:', error);
      }
    }
  };

  const handleEdit = (item: PipelineItem) => {
    setEditingId(item.id);
    setFormData({
      jobType: item.job_type,
      squareFootage: item.square_footage.toString(),
      estimatedDaysToCompletion: item.estimated_days_to_completion.toString(),
      revenuePerSq: item.revenue_per_sq.toString(),
      status: item.status,
      addedDate: item.added_date,
      targetStartDate: item.target_start_date || '',
      notes: item.notes || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      jobType: 'shingle',
      squareFootage: '',
      estimatedDaysToCompletion: '',
      revenuePerSq: '600',
      status: 'pending',
      addedDate: new Date().toISOString().split('T')[0],
      targetStartDate: '',
      notes: '',
    });
    setEditingId(null);
  };

  const handleJobTypeChange = (type: string) => {
    setFormData({
      ...formData,
      jobType: type,
      revenuePerSq: type === 'shingle' ? '600' : '1000',
    });
  };

  const statusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-200 text-gray-800';
      case 'in_queue': return 'bg-blue-200 text-blue-800';
      case 'in_progress': return 'bg-yellow-200 text-yellow-800';
      case 'completed': return 'bg-green-200 text-green-800';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Pipeline Tracker</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add Pipeline Item'}
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

      {/* Form */}
      {showForm && (
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Edit Pipeline Item' : 'Add New Pipeline Item'}
          </h3>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Job Type</label>
                <select
                  value={formData.jobType}
                  onChange={(e) => handleJobTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="shingle">Shingle</option>
                  <option value="metal">Metal</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Square Footage</label>
                <input
                  type="number"
                  value={formData.squareFootage}
                  onChange={(e) => setFormData({ ...formData, squareFootage: e.target.value })}
                  placeholder="e.g., 2000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Est. Days to Complete</label>
                <input
                  type="number"
                  value={formData.estimatedDaysToCompletion}
                  onChange={(e) => setFormData({ ...formData, estimatedDaysToCompletion: e.target.value })}
                  placeholder="e.g., 7"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Revenue per SQ</label>
                <input
                  type="number"
                  value={formData.revenuePerSq}
                  onChange={(e) => setFormData({ ...formData, revenuePerSq: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="pending">Pending</option>
                  <option value="in_queue">In Queue</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Added Date</label>
                <input
                  type="date"
                  value={formData.addedDate}
                  onChange={(e) => setFormData({ ...formData, addedDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Start Date (Optional)</label>
                <input
                  type="date"
                  value={formData.targetStartDate}
                  onChange={(e) => setFormData({ ...formData, targetStartDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-4 py-2 bg-gray-300 text-gray-800 rounded-lg hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {editingId ? 'Update' : 'Add'} Pipeline Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Type</label>
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value);
              loadPipelineItems();
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">All Types</option>
            <option value="shingle">Shingle</option>
            <option value="metal">Metal</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Status</label>
          <select
            value={filterStatus}
            onChange={(e) => {
              setFilterStatus(e.target.value);
              loadPipelineItems();
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in_queue">In Queue</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Pipeline Items Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">SQs</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Est. Days</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Revenue</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Added Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : pipelineItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No pipeline items found
                </td>
              </tr>
            ) : (
              pipelineItems.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${item.job_type === 'shingle' ? 'bg-blue-100 text-blue-800' : 'bg-red-100 text-red-800'}`}>
                      {item.job_type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.square_footage.toFixed(0)}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.estimated_days_to_completion}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">${item.total_revenue.toFixed(0)}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeColor(item.status)}`}>
                      {item.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{item.added_date}</td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
