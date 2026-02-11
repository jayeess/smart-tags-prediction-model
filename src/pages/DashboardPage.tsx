import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Users,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Activity,
  Zap,
} from "lucide-react";
import { healthCheck, predictGuestBehavior, getDemoScenarios } from "../lib/api";
import type { GuestPrediction, DemoScenario, ReservationInput } from "../lib/types";
import RiskGauge from "../components/RiskGauge";
import SmartActions from "../components/SmartActions";
import VoiceCommand from "../components/VoiceCommand";
import { NoteSmartTag, AITagBadge, SentimentBadge, SpendBadge } from "../components/SmartTagBadge";

export default function DashboardPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [prediction, setPrediction] = useState<GuestPrediction | null>(null);
  const [demos, setDemos] = useState<DemoScenario[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});
    getDemoScenarios().then(setDemos).catch(() => {});
  }, []);

  const runDemo = async (demo: DemoScenario) => {
    setLoading(true);
    setPrediction(null);
    try {
      const form: ReservationInput = {
        ...demo.reservation,
        reservation_date: "",
        notes: demo.reservation.notes || "",
      };
      const result = await predictGuestBehavior(form);
      setPrediction(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleVoicePrediction = useCallback((p: GuestPrediction) => {
    setPrediction(p);
  }, []);

  const handleVoiceTranscription = useCallback(() => {
    setPrediction(null);
    setLoading(true);
    setTimeout(() => setLoading(false), 100);
  }, []);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  };

  const riskScore = prediction
    ? prediction.ai_prediction?.risk_score ?? Math.round(prediction.no_show_risk * 100)
    : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-white">Guest Intelligence Console</h1>
        <p className="text-slate-500 text-sm mt-1">
          AI-powered risk prediction, smart tags, and action recommendations
        </p>
      </motion.div>

      {/* ===== BENTO GRID ===== */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-3 auto-rows-min"
      >
        {/* ---- Row 1: Stats (4 small cards) ---- */}
        {[
          { label: "AI Model", value: health?.model_loaded ? "Online" : "Standby", icon: <Brain className="w-4 h-4" />, color: "text-indigo-400", bg: "bg-indigo-500/15" },
          { label: "Engine", value: "ANN v3", icon: <Sparkles className="w-4 h-4" />, color: "text-violet-400", bg: "bg-violet-500/15" },
          { label: "Accuracy", value: "87.7%", icon: <TrendingUp className="w-4 h-4" />, color: "text-emerald-400", bg: "bg-emerald-500/15" },
          { label: "Domain Adapter", value: "Active", icon: <Zap className="w-4 h-4" />, color: "text-amber-400", bg: "bg-amber-500/15" },
        ].map((s) => (
          <motion.div
            key={s.label}
            variants={item}
            className="md:col-span-3 glass glass-hover p-4 flex items-center gap-3"
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.bg} ${s.color}`}>
              {s.icon}
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-medium">{s.label}</div>
              <div className="text-base font-bold text-white">{s.value}</div>
            </div>
          </motion.div>
        ))}

        {/* ---- Row 2: Risk Gauge (left) + Smart Tags & Actions (right) ---- */}
        <motion.div
          variants={item}
          className="md:col-span-5 glass p-6 flex flex-col items-center justify-center min-h-[320px]"
        >
          <AnimatePresence mode="wait">
            {prediction ? (
              <motion.div
                key="gauge"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center"
              >
                <RiskGauge
                  value={riskScore}
                  size={190}
                  label={prediction.risk_label}
                />
                <div className="mt-4 flex items-center gap-2">
                  <AITagBadge tag={prediction.ai_tag} />
                  <SpendBadge tier={prediction.spend_tag} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-center text-slate-600"
              >
                <div className="w-24 h-24 mx-auto rounded-full bg-white/[0.03] flex items-center justify-center mb-3">
                  <Activity className="w-8 h-8 text-slate-700" />
                </div>
                <p className="text-sm">Run a demo or use voice to see the gauge</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div
          variants={item}
          className="md:col-span-7 glass p-6 flex flex-col justify-between min-h-[320px]"
        >
          <AnimatePresence mode="wait">
            {prediction ? (
              <motion.div
                key="details"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-4 flex-1"
              >
                {/* Guest Name + Explanation */}
                <div>
                  <h3 className="text-lg font-bold text-white">{prediction.guest_name}</h3>
                  {prediction.explanation && (
                    <p className="text-xs text-slate-400 mt-1">{prediction.explanation}</p>
                  )}
                </div>

                {/* Sentiment */}
                <div className="flex items-center gap-2">
                  <SentimentBadge sentiment={prediction.sentiment} />
                </div>

                {/* Smart Tags */}
                {prediction.smart_tags && prediction.smart_tags.length > 0 && (
                  <div>
                    <div className="text-[10px] text-slate-500 font-medium mb-1.5">Detected Tags</div>
                    <div className="flex flex-wrap gap-1.5">
                      {prediction.smart_tags.map((tag, i) => (
                        <NoteSmartTag key={`${tag.label}-${i}`} tag={tag} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Smart Actions */}
                <SmartActions prediction={prediction} />
              </motion.div>
            ) : (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center text-slate-600"
              >
                <Users className="w-8 h-8 mb-2" />
                <p className="text-sm">Guest insights will appear here</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ---- Row 3: Demo Scenarios (left) + Voice Command (right) ---- */}
        <motion.div
          variants={item}
          className="md:col-span-8 glass p-5"
        >
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            Quick Demo Scenarios
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {demos.map((d) => (
              <motion.button
                key={d.name}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => runDemo(d)}
                disabled={loading}
                className="glass glass-hover p-3 text-left group disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-white group-hover:text-indigo-400 transition-colors">
                  {d.name}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5 truncate">
                  {d.reservation.notes ? d.reservation.notes.slice(0, 50) + "..." : "No notes"}
                </div>
              </motion.button>
            ))}
          </div>
        </motion.div>

        <motion.div
          variants={item}
          className="md:col-span-4 glass p-5 flex flex-col items-center justify-center"
        >
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <span className="text-lg">&#x1F399;</span>
            Voice Command
          </h3>
          <VoiceCommand
            onTranscription={handleVoiceTranscription}
            onPrediction={handleVoicePrediction}
          />
        </motion.div>

        {/* ---- Row 4: Navigation Links ---- */}
        <motion.div variants={item} className="md:col-span-6">
          <Link
            to="/analyze"
            className="glass glass-hover p-5 flex items-center justify-between group block"
          >
            <div>
              <h3 className="font-semibold text-sm text-white">Analyze a Reservation</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Full form with Time-Travel Simulator
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </Link>
        </motion.div>
        <motion.div variants={item} className="md:col-span-6">
          <Link
            to="/tables"
            className="glass glass-hover p-5 flex items-center justify-between group block"
          >
            <div>
              <h3 className="font-semibold text-sm text-white">Table View</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Tonight's reservations with batch predictions
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </Link>
        </motion.div>
      </motion.div>

      {/* API Status */}
      {health && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-4 flex items-center gap-2 text-[11px] text-slate-600"
        >
          <Activity className="w-3 h-3" />
          API: {String(health.status)} | v{String(health.version)}
          {health.domain_adapter ? ` | Adapter: ${String(health.domain_adapter)}` : null}
        </motion.div>
      )}
    </div>
  );
}
