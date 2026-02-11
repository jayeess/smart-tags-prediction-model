import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Brain,
  Users,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Activity,
} from "lucide-react";
import { healthCheck } from "../lib/api";

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  glow: string;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});
  }, []);

  const stats: StatCard[] = [
    {
      label: "AI Model",
      value: health?.model_loaded ? "Loaded" : "Standby",
      icon: <Brain className="w-5 h-5" />,
      color: "text-indigo-400",
      glow: "bg-indigo-500/15",
    },
    {
      label: "Engine",
      value: "ANN v1",
      icon: <Sparkles className="w-5 h-5" />,
      color: "text-violet-400",
      glow: "bg-violet-500/15",
    },
    {
      label: "Accuracy",
      value: "87.7%",
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-emerald-400",
      glow: "bg-emerald-500/15",
    },
    {
      label: "Tags",
      value: "12+",
      icon: <Users className="w-5 h-5" />,
      color: "text-amber-400",
      glow: "bg-amber-500/15",
    },
  ];

  const features = [
    {
      title: "Guest Behavior Prediction",
      desc: "ANN model predicts no-show probability and reliability scores for each reservation.",
      icon: <Brain className="w-5 h-5 text-indigo-400" />,
    },
    {
      title: "Smart Tag Extraction",
      desc: "Auto-detects VIP, allergy, dietary, milestone, and behavioral tags from notes.",
      icon: <Sparkles className="w-5 h-5 text-violet-400" />,
    },
    {
      title: "Sentiment Analysis",
      desc: "NLP layer analyzes reservation notes to gauge guest mood and expectations.",
      icon: <TrendingUp className="w-5 h-5 text-emerald-400" />,
    },
    {
      title: "No-Show Risk Alerts",
      desc: "Flags high-risk reservations so managers can take proactive action.",
      icon: <AlertTriangle className="w-5 h-5 text-red-400" />,
    },
  ];

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-1">
          AI-powered guest insights and predictive smart tags
        </p>
      </motion.div>

      {/* Stats */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8"
      >
        {stats.map((s) => (
          <motion.div
            key={s.label}
            variants={item}
            className="glass glass-hover p-4 flex items-center gap-3"
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.glow} ${s.color}`}
            >
              {s.icon}
            </div>
            <div>
              <div className="text-[11px] text-slate-500 font-medium">{s.label}</div>
              <div className="text-lg font-bold text-white">{s.value}</div>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Features */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8"
      >
        {features.map((f) => (
          <motion.div
            key={f.title}
            variants={item}
            className="glass glass-hover p-5 flex gap-4"
          >
            <div className="mt-0.5">{f.icon}</div>
            <div>
              <h3 className="font-semibold text-sm text-white mb-1">{f.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <motion.div variants={item}>
          <Link
            to="/analyze"
            className="glass glass-hover p-5 flex items-center justify-between group block"
          >
            <div>
              <h3 className="font-semibold text-sm text-white">Analyze a Reservation</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Get AI predictions and smart tags for a guest
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-colors" />
          </Link>
        </motion.div>
        <motion.div variants={item}>
          <Link
            to="/tables"
            className="glass glass-hover p-5 flex items-center justify-between group block"
          >
            <div>
              <h3 className="font-semibold text-sm text-white">Table View</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                View tonight's reservations with predictions
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
          transition={{ delay: 0.5 }}
          className="mt-6 flex items-center gap-2 text-[11px] text-slate-600"
        >
          <Activity className="w-3 h-3" />
          API: {String(health.status)} | v{String(health.version)}
        </motion.div>
      )}
    </div>
  );
}
