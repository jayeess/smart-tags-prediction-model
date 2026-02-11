import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Settings, Server, Brain, Shield, Activity } from "lucide-react";
import { healthCheck } from "../lib/api";

export default function SettingsPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});
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
