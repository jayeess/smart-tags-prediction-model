import { useEffect, useState } from "react";
import { Settings, Server, Brain, Shield } from "lucide-react";
import { healthCheck } from "../lib/api";

export default function SettingsPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});
  }, []);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-500" />
          Settings
        </h1>
        <p className="text-gray-500 mt-1">System configuration and status</p>
      </div>

      <div className="space-y-4">
        {/* API Status */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold">API Status</h2>
          </div>
          {health ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Status</div>
                <div className="font-medium text-emerald-600">
                  {String(health.status)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Version</div>
                <div className="font-medium">{String(health.version)}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Model Loaded</div>
                <div className="font-medium">
                  {health.model_loaded ? "Yes" : "On-demand"}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-500 text-xs">Service</div>
                <div className="font-medium text-xs">
                  {String(health.service)}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">
              Unable to reach API. Start the backend with: uvicorn api.index:app
              --port 8000
            </p>
          )}
        </div>

        {/* ML Model Info */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold">ML Model</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Architecture</div>
              <div className="font-medium">ANN (128-64-32-1)</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Activation</div>
              <div className="font-medium">SiLU + Sigmoid</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Test Accuracy</div>
              <div className="font-medium text-emerald-600">87.73%</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-gray-500 text-xs">Parameters</div>
              <div className="font-medium">13,953</div>
            </div>
          </div>
        </div>

        {/* Tenant Isolation */}
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold">Tenant Isolation</h2>
          </div>
          <p className="text-sm text-gray-600">
            All API requests require an <code className="bg-gray-100 px-1 rounded">X-Tenant-ID</code> header.
            The prediction model only processes data scoped to the requesting tenant.
            Cross-tenant data access is prevented at the API layer.
          </p>
        </div>
      </div>
    </div>
  );
}
