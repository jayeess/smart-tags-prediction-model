import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Users,
  Sparkles,
  Activity,
  Zap,
  Search,
  Utensils,
  Clock,
  Shield,
  AlertTriangle,
  ChevronRight,
  BarChart3,
} from "lucide-react";
import { healthCheck, predictGuestBehavior, getDemoScenarios } from "../lib/api";
import type { GuestPrediction, DemoScenario, ReservationInput } from "../lib/types";
import RiskGauge from "../components/RiskGauge";
import SmartActions from "../components/SmartActions";
import VoiceCommand from "../components/VoiceCommand";
import { NoteSmartTag, AITagBadge, SentimentBadge, SpendBadge, ConfidenceMeter } from "../components/SmartTagBadge";
import { getHistory } from "../lib/historyStore";

/* ── Greeting based on time of day ─────────────────────── */
function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 17) return "Good Afternoon";
  return "Good Evening";
}

/* ── Live Clock hook ───────────────────────────────────── */
function useLiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

/* ── Animated Counter ──────────────────────────────────── */
function AnimatedNumber({ value, duration = 800 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const to = value;
    let frame: number;
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (p < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{display}</>;
}

/* ── History Stats ─────────────────────────────────────── */
function useHistoryStats() {
  return useMemo(() => {
    const records = getHistory();
    const today = new Date().toDateString();
    const todayCount = records.filter(
      (r) => new Date(r.timestamp).toDateString() === today
    ).length;
    const highRiskCount = records.filter(
      (r) => r.prediction.risk_label === "High Risk"
    ).length;
    return { total: records.length, todayCount, highRiskCount };
  }, []);
}

/* ── Demo Category Badges ──────────────────────────────── */
const DEMO_CATEGORIES: Record<string, { color: string; bg: string }> = {
  "High Risk": { color: "text-red-400", bg: "bg-red-500/10" },
  "Low Risk": { color: "text-emerald-400", bg: "bg-emerald-500/10" },
  "VIP": { color: "text-amber-400", bg: "bg-amber-500/10" },
  default: { color: "text-slate-400", bg: "bg-white/5" },
};

function getDemoCategory(notes: string): string {
  const l = notes.toLowerCase();
  if (l.includes("vip") || l.includes("celebration") || l.includes("anniversary")) return "VIP";
  if (l.includes("cancel") || l.includes("late") || l.includes("no-show")) return "High Risk";
  return "Low Risk";
}

/* ── Main Component ────────────────────────────────────── */
export default function DashboardPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [prediction, setPrediction] = useState<GuestPrediction | null>(null);
  const [demos, setDemos] = useState<DemoScenario[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeDemo, setActiveDemo] = useState<string | null>(null);
  const clock = useLiveClock();
  const stats = useHistoryStats();

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});
    getDemoScenarios().then(setDemos).catch(() => {});
  }, []);

  const runDemo = async (demo: DemoScenario) => {
    setLoading(true);
    setPrediction(null);
    setActiveDemo(demo.name);
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
    setActiveDemo(null);
  }, []);

  const handleVoiceTranscription = useCallback(() => {
    setPrediction(null);
    setActiveDemo(null);
  }, []);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  const riskScore = prediction
    ? prediction.ai_prediction?.risk_score ?? Math.round(prediction.no_show_risk * 100)
    : 0;

  // API is connected flag
  const apiOnline = !!(health && health.status === "healthy");

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* ═══ Header with Greeting + Live Clock ═══ */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6 flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">{getGreeting()}</h1>
          <p className="text-slate-500 text-sm mt-1">
            Guest Intelligence Console — AI-powered risk analysis
          </p>
        </div>
        <div className="hidden md:flex flex-col items-end gap-1">
          <div className="text-lg font-bold text-white tabular-nums">
            {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="text-[11px] text-slate-500">
            {clock.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </div>
      </motion.div>

      {/* ═══ BENTO GRID ═══ */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-3 auto-rows-min"
      >
        {/* ─── Row 1: Status Cards (4x) ─── */}
        {[
          {
            label: "AI Model",
            value: apiOnline ? "Online" : "Standby",
            icon: <Brain className="w-4 h-4" />,
            color: "text-indigo-400",
            bg: "bg-indigo-500/15",
            glow: apiOnline ? "shadow-[0_0_12px_rgba(99,102,241,0.15)]" : "",
            dot: apiOnline ? "bg-emerald-400" : "bg-slate-600",
          },
          {
            label: "Engine",
            value: "ANN v3",
            icon: <Sparkles className="w-4 h-4" />,
            color: "text-violet-400",
            bg: "bg-violet-500/15",
            glow: "",
            dot: "",
          },
          {
            label: "Today's Analyses",
            value: stats.todayCount,
            icon: <BarChart3 className="w-4 h-4" />,
            color: "text-cyan-400",
            bg: "bg-cyan-500/15",
            glow: "",
            dot: "",
          },
          {
            label: "High Risk Flags",
            value: stats.highRiskCount,
            icon: <AlertTriangle className="w-4 h-4" />,
            color: stats.highRiskCount > 0 ? "text-red-400" : "text-emerald-400",
            bg: stats.highRiskCount > 0 ? "bg-red-500/15" : "bg-emerald-500/15",
            glow: stats.highRiskCount > 0 ? "shadow-[0_0_12px_rgba(239,68,68,0.1)]" : "",
            dot: "",
          },
        ].map((s) => (
          <motion.div
            key={s.label}
            variants={item}
            className={`md:col-span-3 glass glass-hover p-4 flex items-center gap-3 ${s.glow}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.bg} ${s.color}`}>
              {s.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1.5">
                {s.label}
                {s.dot && (
                  <span className={`w-1.5 h-1.5 rounded-full ${s.dot} inline-block`}>
                    {s.dot === "bg-emerald-400" && (
                      <span className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    )}
                  </span>
                )}
              </div>
              <div className="text-base font-bold text-white">
                {typeof s.value === "number" ? <AnimatedNumber value={s.value} /> : s.value}
              </div>
            </div>
          </motion.div>
        ))}

        {/* ─── Row 2: Risk Gauge (left) + Insight Panel (right) ─── */}
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
                <div className="mt-4 flex items-center gap-2 flex-wrap justify-center">
                  <AITagBadge tag={prediction.ai_tag} />
                  <SpendBadge tier={prediction.spend_tag} />
                </div>
                {/* Confidence */}
                <div className="mt-3 w-full max-w-[200px]">
                  <div className="text-[10px] text-slate-500 font-medium mb-1 text-center">Model Confidence</div>
                  <ConfidenceMeter value={prediction.confidence} />
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
                <div className="relative w-24 h-24 mx-auto mb-4">
                  <div className="absolute inset-0 rounded-full bg-white/[0.02] flex items-center justify-center">
                    <Shield className="w-8 h-8 text-slate-700" />
                  </div>
                  {/* Subtle rotating ring */}
                  <motion.div
                    className="absolute inset-0 rounded-full border border-dashed border-white/[0.06]"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  />
                </div>
                <p className="text-sm font-medium text-slate-500">Risk Gauge</p>
                <p className="text-xs text-slate-600 mt-1">Run a demo or use voice command</p>
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
                {/* Guest Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-white">{prediction.guest_name}</h3>
                    {prediction.explanation && (
                      <p className="text-xs text-slate-400 mt-1 max-w-sm">{prediction.explanation}</p>
                    )}
                  </div>
                  {activeDemo && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium shrink-0">
                      Demo
                    </span>
                  )}
                </div>

                {/* Sentiment */}
                {prediction.sentiment && (
                  <div className="flex items-center gap-2">
                    <SentimentBadge sentiment={prediction.sentiment} />
                  </div>
                )}

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
                <Users className="w-8 h-8 mb-3 text-slate-700" />
                <p className="text-sm font-medium text-slate-500">Guest Insights</p>
                <p className="text-xs text-slate-600 mt-1">Select a scenario to see predictions</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ─── Row 3: Demo Scenarios (left) + Voice Command (right) ─── */}
        <motion.div
          variants={item}
          className="md:col-span-8 glass p-5"
        >
          <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-indigo-400" />
            Quick Demo Scenarios
            <span className="text-[10px] font-normal text-slate-500 ml-auto">
              {demos.length} scenarios
            </span>
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[280px] overflow-y-auto pr-1">
            {demos.map((d) => {
              const cat = getDemoCategory(d.reservation.notes || "");
              const catStyle = DEMO_CATEGORIES[cat] || DEMO_CATEGORIES.default;
              const isActive = activeDemo === d.name && prediction;
              return (
                <motion.button
                  key={d.name}
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => runDemo(d)}
                  disabled={loading}
                  className={`glass p-3 text-left group disabled:opacity-50 transition-all duration-200 ${
                    isActive ? "border-indigo-500/40 bg-indigo-500/10" : "glass-hover"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="text-xs font-semibold text-white group-hover:text-indigo-400 transition-colors truncate flex-1">
                      {d.name}
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${catStyle.color} ${catStyle.bg}`}>
                      {cat}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600 truncate">
                    {d.reservation.notes ? d.reservation.notes.slice(0, 50) + "..." : "No notes"}
                  </div>
                </motion.button>
              );
            })}
          </div>
          {loading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-indigo-400">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
                <Activity className="w-3.5 h-3.5" />
              </motion.div>
              Analyzing...
            </div>
          )}
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
            compact
          />
        </motion.div>

        {/* ─── Row 4: Quick Navigation Cards ─── */}
        {[
          {
            to: "/analyze",
            icon: <Search className="w-5 h-5" />,
            title: "Analyze",
            desc: "Full prediction form with simulator",
            accent: "group-hover:text-indigo-400",
            iconBg: "bg-indigo-500/10 text-indigo-400",
          },
          {
            to: "/tables",
            icon: <Utensils className="w-5 h-5" />,
            title: "Tables",
            desc: "Tonight's service & batch predict",
            accent: "group-hover:text-violet-400",
            iconBg: "bg-violet-500/10 text-violet-400",
          },
          {
            to: "/history",
            icon: <Clock className="w-5 h-5" />,
            title: "History",
            desc: `${stats.total} past analyses`,
            accent: "group-hover:text-cyan-400",
            iconBg: "bg-cyan-500/10 text-cyan-400",
          },
        ].map((nav) => (
          <motion.div key={nav.to} variants={item} className="md:col-span-4">
            <Link
              to={nav.to}
              className="glass glass-hover p-5 flex items-center gap-4 group block"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${nav.iconBg}`}>
                {nav.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`font-semibold text-sm text-white transition-colors ${nav.accent}`}>
                  {nav.title}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">{nav.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
            </Link>
          </motion.div>
        ))}
      </motion.div>

      {/* ═══ API Status Footer ═══ */}
      {health && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-4 flex items-center gap-3 text-[11px] text-slate-600"
        >
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${apiOnline ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className={apiOnline ? "text-emerald-500" : "text-red-400"}>
              {apiOnline ? "Connected" : "Disconnected"}
            </span>
          </div>
          <span className="text-slate-700">|</span>
          <span>v{String(health.version)}</span>
          {!!health.domain_adapter && (
            <>
              <span className="text-slate-700">|</span>
              <span>Adapter: {String(health.domain_adapter)}</span>
            </>
          )}
          <span className="text-slate-700">|</span>
          <span>Accuracy: 87.7%</span>
        </motion.div>
      )}
    </div>
  );
}
