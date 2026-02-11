import { motion } from "framer-motion";
import { Utensils, Calendar, Armchair } from "lucide-react";
import type { PredictionResponseUnified, SmartTag } from "../lib/types";
import { clsx } from "clsx";

function iconForTag(tag: SmartTag) {
  if (tag.category === "Dietary") return Utensils;
  if (tag.category === "Occasion") return Calendar;
  return Armchair;
}

function badgeColor(tag: SmartTag) {
  if (tag.category === "Dietary") return "bg-emerald-600/20 text-emerald-300 border-emerald-600/40";
  if (tag.category === "Occasion") return "bg-purple-600/20 text-purple-300 border-purple-600/40";
  return "bg-sky-600/20 text-sky-300 border-sky-600/40";
}

export default function GuestCard({ data }: { data: PredictionResponseUnified }) {
  const score = data.ai_prediction.risk_score;
  const border = score > 0.65 ? "border-red-600/60" : score < 0.35 ? "border-emerald-600/60" : "border-slate-600/60";
  const pulse = score > 0.65 ? "animate-pulse" : "";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={clsx(
        "bg-slate-900/60 backdrop-blur border rounded-2xl p-6 shadow-lg text-white",
        "ring-1 ring-black/10",
        border,
        pulse
      )}
    >
      <div className="flex items-center justify-between">
        <div className="text-sm uppercase tracking-wide text-slate-300">AI Risk</div>
        <div className="text-sm text-slate-400">Score</div>
      </div>
      <div className="mt-2 flex items-end gap-3">
        <div className="text-3xl font-semibold">{(score * 100).toFixed(0)}%</div>
        <div className="text-lg text-slate-300">{data.ai_prediction.risk_label}</div>
      </div>
      <div className="mt-2 text-slate-400 text-sm">{data.ai_prediction.explanation}</div>
      <div className="mt-5 flex flex-wrap gap-2">
        {data.smart_tags.map((t, idx) => {
          const Icon = iconForTag(t);
          return (
            <div
              key={`${t.category}-${t.label}-${idx}`}
              className={clsx("px-3 py-1.5 rounded-full border text-sm inline-flex items-center gap-1.5", badgeColor(t))}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
