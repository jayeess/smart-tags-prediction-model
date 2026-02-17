import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings, Server, Brain, Shield, Activity, Cloud, CloudOff, HardDrive, Database } from "lucide-react";
import { healthCheck } from "../lib/api";
import { getCloudStatus, getHistory } from "../lib/historyStore";
import { isSupabaseConfigured } from "../lib/supabase";

type CloudState = {
  configured: boolean;
  connected: boolean;
  cloudCount: number;
  localCount: number;
  loading: boolean;
};

export default function SettingsPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [cloud, setCloud] = useState<CloudState>({
    configured: false,
    connected: false,
    cloudCount: 0,
    localCount: 0,
    loading: true,
  });

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});

    // Check cloud sync status
    const localCount = getHistory().length;
    if (!isSupabaseConfigured()) {
      setCloud({ configured: false, connected: false, cloudCount: 0, localCount, loading: false });
    } else {
      getCloudStatus().then((status) => {
        setCloud({
          configured: status.configured,
          connected: status.connected,
          cloudCount: status.cloudCount,
          localCount,
          loading: false,
        });
      });
    }
  }, []);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-400" />
          Settings
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          System configuration and status
        </p>
      </motion.div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-4"
      >
        {/* API Status */}
        <motion.div variants={item} className="glass p-6">
          <div className="flex items-center gap-2 mb-4">
            <Server className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-sm text-white">API Status</h2>
          </div>
          {health ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="glass rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">Status</div>
                <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                  {String(health.status)}
                </div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">Version</div>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {String(health.version)}
                </div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">Model Loaded</div>
                <div className="text-sm font-semibold text-white mt-0.5">
                  {health.model_loaded ? "Yes" : "On-demand"}
                </div>
              </div>
              <div className="glass rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">Service</div>
                <div className="text-sm font-semibold text-white mt-0.5 truncate">
                  {String(health.service)}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Activity className="w-4 h-4 animate-pulse" />
              Connecting to API...
            </div>
          )}
        </motion.div>

        {/* Cloud Sync Status */}
        <motion.div variants={item} className="glass p-6">
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-sm text-white">Cloud Sync (Supabase)</h2>
            {!cloud.loading && (
              <span className={`ml-auto text-[10px] font-semibold px-2.5 py-1 rounded-full ${
                cloud.connected
                  ? "text-emerald-400 bg-emerald-500/10"
                  : cloud.configured
                  ? "text-red-400 bg-red-500/10"
                  : "text-slate-500 bg-white/5"
              }`}>
                {cloud.connected ? "Connected" : cloud.configured ? "Disconnected" : "Not Configured"}
              </span>
            )}
          </div>

          {cloud.loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Activity className="w-4 h-4 animate-pulse" />
              Checking cloud status...
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="glass rounded-xl p-3">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    <HardDrive className="w-3 h-3" />
                    Local Records
                  </div>
                  <div className="text-sm font-semibold text-white mt-0.5">
                    {cloud.localCount}
                  </div>
                </div>
                <div className="glass rounded-xl p-3">
                  <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                    {cloud.connected ? <Cloud className="w-3 h-3" /> : <CloudOff className="w-3 h-3" />}
                    Cloud Records
                  </div>
                  <div className={`text-sm font-semibold mt-0.5 ${cloud.connected ? "text-white" : "text-slate-600"}`}>
                    {cloud.connected ? cloud.cloudCount : "—"}
                  </div>
                </div>
              </div>

              {!cloud.configured && (
                <div className="glass rounded-xl p-4">
                  <p className="text-xs text-slate-400 leading-relaxed mb-3">
                    Enable cloud sync for cross-device history persistence.
                    Analysis records will be stored in Supabase (PostgreSQL)
                    and sync automatically across all devices.
                  </p>
                  <div className="text-[11px] text-slate-500 font-medium mb-2">Setup:</div>
                  <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
                    <li>Create a free project at{" "}
                      <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-400">supabase.com</code>
                    </li>
                    <li>Run the SQL from{" "}
                      <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-400">supabase/migration.sql</code>
                    </li>
                    <li>Add to your{" "}
                      <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-400">.env</code>:
                    </li>
                  </ol>
                  <div className="mt-2 glass rounded-lg p-3 text-[11px] font-mono text-slate-400">
                    <div>VITE_SUPABASE_URL=https://your-project.supabase.co</div>
                    <div>VITE_SUPABASE_ANON_KEY=eyJhbG...</div>
                  </div>
                </div>
              )}

              {cloud.configured && !cloud.connected && (
                <div className="glass rounded-xl p-3 border border-red-500/20">
                  <p className="text-xs text-red-400">
                    Supabase credentials are configured but connection failed.
                    Check your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, and ensure the
                    analysis_history table exists.
                  </p>
                </div>
              )}

              {cloud.connected && (
                <div className="glass rounded-xl p-3 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400">
                    Cloud sync is active. Records are persisted to Supabase and
                    available across all devices. Local storage is used as an
                    instant cache.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* ML Model Info */}
        <motion.div variants={item} className="glass p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-sm text-white">ML Model</h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium">Architecture</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                ANN (128-64-32-1)
              </div>
            </div>
            <div className="glass rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium">Activation</div>
              <div className="text-sm font-semibold text-white mt-0.5">
                SiLU + Sigmoid
              </div>
            </div>
            <div className="glass rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium">Test Accuracy</div>
              <div className="text-sm font-semibold text-emerald-400 mt-0.5">
                87.73%
              </div>
            </div>
            <div className="glass rounded-xl p-3">
              <div className="text-[11px] text-slate-500 font-medium">Parameters</div>
              <div className="text-sm font-semibold text-white mt-0.5">13,953</div>
            </div>
          </div>
        </motion.div>

        {/* Tenant Isolation */}
        <motion.div variants={item} className="glass p-6">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-slate-500" />
            <h2 className="font-semibold text-sm text-white">Tenant Isolation</h2>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            All API requests require an{" "}
            <code className="bg-white/5 px-1.5 py-0.5 rounded text-indigo-400 text-xs">
              X-Tenant-ID
            </code>{" "}
            header. The prediction model only processes data scoped to the
            requesting tenant. Cross-tenant data access is prevented at the API
            layer.
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
