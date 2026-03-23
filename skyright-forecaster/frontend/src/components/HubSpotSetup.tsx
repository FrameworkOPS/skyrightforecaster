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
      }
    } catch (error) {
      console.error('Error checking HubSpot status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleInitiateOAuth = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/hubspot/auth`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error('Error initiating OAuth:', error);
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

      {status && !status.configured && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Setup Instructions</h3>

            <ol className="space-y-4 text-gray-700">
              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">1</span>
                <div>
                  <p className="font-medium">Create HubSpot OAuth App</p>
                  <p className="text-sm text-gray-600">Go to HubSpot → Settings → Integrations → Private Apps → Create New App</p>
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
                  <p className="font-medium">Set Redirect URI</p>
                  <p className="text-sm text-gray-600 mb-2">Add this redirect URI in your HubSpot app settings:</p>
                  <div className="flex items-center gap-2">
                    <code className="bg-gray-100 px-3 py-2 rounded flex-1 text-sm overflow-auto">
                      {window.location.origin}/api/hubspot/callback
                    </code>
                    <button
                      onClick={() => copyToClipboard(`${window.location.origin}/api/hubspot/callback`)}
                      className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded text-sm"
                    >
                      {copied ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">4</span>
                <div>
                  <p className="font-medium">Set Environment Variables</p>
                  <p className="text-sm text-gray-600 mb-2">Add these to your backend .env file:</p>
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
                  </div>
                </div>
              </li>

              <li className="flex gap-4">
                <span className="flex-shrink-0 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center font-semibold text-sm">5</span>
                <div>
                  <p className="font-medium">Authenticate with HubSpot</p>
                  <p className="text-sm text-gray-600 mb-2">Click the button below to authorize access:</p>
                </div>
              </li>
            </ol>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleInitiateOAuth}
              className="px-6 py-3 bg-orange-500 text-white font-medium rounded hover:bg-orange-600"
            >
              Authorize with HubSpot
            </button>
          </div>
        </div>
      )}

      {status && status.configured && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <span className="text-2xl">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">HubSpot Integration Active</h3>
              <p className="text-sm text-gray-600">Your HubSpot pipeline data will automatically sync when you view the Sales Forecast tab.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
