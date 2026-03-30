import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { API_BASE_URL } from '../utils/apiConfig';

interface HubSpotStatus {
  configured: boolean;
  message: string;
}

export default function HubSpotSetup() {
  const { token } = useAuthStore();
  const [status, setStatus] = useState<HubSpotStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    checkHubSpotStatus();
  }, []);

  const checkHubSpotStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/hubspot/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(data.data);
      } else {
        setStatus({ configured: false, message: 'Unable to check HubSpot status. Ensure the backend is running.' });
      }
    } catch (error) {
      console.error('Error checking HubSpot status:', error);
      setStatus({ configured: false, message: 'Unable to connect to backend. Ensure the server is running.' });
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateOAuth = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/hubspot/auth-url`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.authUrl;
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.message || 'Failed to get HubSpot authorization URL. Ensure HUBSPOT_CLIENT_ID is set on the backend.');
      }
    } catch (error) {
      console.error('Error initiating OAuth:', error);
      alert('Failed to connect to backend. Ensure the server is running.');
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/hubspot/sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const data = await res.json();
        const result = data.data;
        setSyncResult(`Sync complete: ${result.created} created, ${result.updated} updated, ${result.total} total deals.`);
      } else {
        const errData = await res.json().catch(() => ({}));
        setSyncResult(`Sync failed: ${errData.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error syncing:', error);
      setSyncResult('Sync failed: Could not connect to backend.');
    } finally {
      setSyncing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">HubSpot Integration Setup</h2>
        <button
          onClick={checkHubSpotStatus}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          Refresh Status
        </button>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">Checking HubSpot status...</div>
      )}

      {status && (
        <div className={`border-l-4 p-4 rounded ${
          status.configured
            ? 'border-green-400 bg-green-50'
            : 'border-yellow-400 bg-yellow-50'
        }`}>
          <p className={`font-medium ${
            status.configured ? 'text-green-800' : 'text-yellow-800'
          }`}>
            {status.message}
          </p>
        </div>
      )}

      {/* Sync Section - always visible when configured */}
      {status && status.configured && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-green-700 font-bold text-lg">HS</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">HubSpot Integration Active</h3>
              <p className="text-sm text-gray-600">Your HubSpot pipeline data is connected. Pipeline data displays on the Sales Forecast tab.</p>
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync Jobs Now'}
            </button>
          </div>

          {syncResult && (
            <div className={`p-3 rounded text-sm ${
              syncResult.includes('failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
            }`}>
              {syncResult}
            </div>
          )}
        </div>
      )}

      {/* Setup Instructions - shown when not configured */}
      {status && !status.configured && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Setup Instructions</h3>

            <ol className="space-y-4 text-gray-700">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">1</span>
                <div>
                  <p className="font-medium">Create HubSpot Private App or OAuth App</p>
                  <p className="text-sm text-gray-600">Go to HubSpot Settings - Integrations - Private Apps - Create New App</p>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">2</span>
                <div>
                  <p className="font-medium">Configure Scopes</p>
                  <p className="text-sm text-gray-600 mb-2">Add these scopes to your app:</p>
                  <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
                    <li><code className="bg-gray-100 px-2 py-1 rounded">crm.objects.deals.read</code></li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">crm.objects.contacts.read</code></li>
                    <li><code className="bg-gray-100 px-2 py-1 rounded">crm.objects.companies.read</code></li>
                  </ul>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">3</span>
                <div>
                  <p className="font-medium">Set Redirect URI (OAuth only)</p>
                  <p className="text-sm text-gray-600 mb-2">Add this redirect URI in your HubSpot app settings:</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-100 px-3 py-2 rounded flex-1 text-sm overflow-auto">
                      {window.location.origin}/api/hubspot/callback
                    </code>
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/api/hubspot/callback`)}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    >
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">4</span>
                <div>
                  <p className="font-medium">Set Environment Variables on Backend</p>
                  <p className="text-sm text-gray-600 mb-2">Add these to your backend <code className="bg-gray-100 px-1 rounded">.env</code> file:</p>
                  <div className="space-y-2">
                    <div className="bg-gray-100 px-3 py-2 rounded text-sm">
                      <code>HUBSPOT_CLIENT_ID=your_client_id_here</code>
                    </div>
                    <div className="bg-gray-100 px-3 py-2 rounded text-sm">
                      <code>HUBSPOT_CLIENT_SECRET=your_client_secret_here</code>
                    </div>
                    <div className="bg-gray-100 px-3 py-2 rounded text-sm">
                      <code>HUBSPOT_ACCESS_TOKEN=your_access_token_here</code>
                    </div>
                    <div className="bg-gray-100 px-3 py-2 rounded text-sm">
                      <code>HUBSPOT_REDIRECT_URI=your_callback_url_here</code>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    For Private Apps: only HUBSPOT_ACCESS_TOKEN and HUBSPOT_CLIENT_SECRET are needed.
                    For OAuth Apps: all four variables are required.
                  </p>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">5</span>
                <div>
                  <p className="font-medium">Restart the Backend Server</p>
                  <p className="text-sm text-gray-600">After setting environment variables, restart the backend and click "Refresh Status" above.</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={handleInitiateOAuth}
              className="px-6 py-3 bg-orange-500 text-white font-medium rounded hover:bg-orange-600"
            >
              Authorize with HubSpot (OAuth)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
