import { motion } from "framer-motion";
import type { GuestPrediction } from "../lib/types";
import {
  AITagBadge,
  SpendBadge,
  SentimentBadge,
  ConfidenceMeter,
} from "./SmartTagBadge";
import { User, Shield, AlertTriangle, TrendingUp, Clock } from "lucide-react";

interface Props {
  prediction: GuestPrediction;
  compact?: boolean;
  onClick?: () => void;
}

export default function GuestInsightCard({ prediction, compact, onClick }: Props) {
  const isHighRisk = prediction.no_show_risk >= 0.6;
  const isMedRisk = prediction.no_show_risk >= 0.35;

  const glowClass = isHighRisk
    ? "glow-red animate-pulse-red"
    : isMedRisk
    ? "glow-amber"
    : "glow-green";

  const riskColor = isHighRisk
    ? "text-red-400"
    : isMedRisk
    ? "text-amber-400"
    : "text-emerald-400";

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className={`glass glass-hover p-4 cursor-pointer ${isHighRisk ? "glow-red animate-pulse-red" : ""}`}
        onClick={onClick}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
              <User className="w-4 h-4 text-slate-400" />
            </div>
            <span className="font-semibold text-sm text-white">{prediction.guest_name}</span>
          </div>
          <AITagBadge tag={prediction.ai_tag} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-lg font-bold ${riskColor}`}>
            {(prediction.reliability_score * 100).toFixed(0)}%
          </span>
          <SpendBadge tier={prediction.spend_tag} />
          <SentimentBadge sentiment={prediction.sentiment} />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`glass p-6 ${glowClass}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h3 className="font-bold text-lg text-white flex items-center gap-2">
            <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center">
              <User className="w-5 h-5 text-slate-400" />
            </div>
            {prediction.guest_name}
          </h3>
          <p className="text-[11px] text-slate-500 mt-1 ml-11">
            Tenant: {prediction.tenant_id}
          </p>
        </div>
        <AITagBadge tag={prediction.ai_tag} />
      </div>

      {/* Score Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1">
            <Shield className="w-3.5 h-3.5" />
            Reliability
          </div>
          <div className="text-3xl font-extrabold text-white">
            {(prediction.reliability_score * 100).toFixed(1)}
            <span className="text-sm text-slate-500 ml-0.5">%</span>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            No-Show Risk
          </div>
          <div className={`text-3xl font-extrabold ${riskColor}`}>
            {(prediction.no_show_risk * 100).toFixed(1)}
            <span className="text-sm opacity-60 ml-0.5">%</span>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        <SpendBadge tier={prediction.spend_tag} />
        <SentimentBadge sentiment={prediction.sentiment} />
        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 ${riskColor}`}>
          {prediction.risk_label}
        </span>
      </div>

      {/* Confidence */}
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1.5">
          <TrendingUp className="w-3 h-3" />
          Model Confidence
        </div>
        <ConfidenceMeter value={prediction.confidence} />
      </div>

      {/* Timestamp */}
      <div className="pt-3 border-t border-white/5 flex items-center gap-1 text-[11px] text-slate-600">
        <Clock className="w-3 h-3" />
        {new Date(prediction.predicted_at).toLocaleString()}
      </div>
    </motion.div>
  );
}
