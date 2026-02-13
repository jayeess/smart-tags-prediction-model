import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Trash2, Search, ChevronDown, ChevronUp } from "lucide-react";
import { getHistory, clearHistory, deleteRecord, type AnalysisRecord } from "../lib/historyStore";
import { NoteSmartTag, AITagBadge, SpendBadge, SentimentBadge } from "../components/SmartTagBadge";
import RiskGauge from "../components/RiskGauge";

function riskColor(label: string) {
  if (label === "High Risk") return "text-red-400 bg-red-500/10 border-red-500/20";
  if (label === "Medium Risk") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function HistoryRow({ record, onDelete }: { record: AnalysisRecord; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const { prediction, input } = record;
  const riskScore = prediction.ai_prediction?.risk_score ?? Math.round(prediction.no_show_risk * 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, transition: { duration: 0.15 } }}
      className="glass overflow-hidden"
    >
      {/* Summary Row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left p-4 flex items-center gap-3 hover:bg-white/[0.02] transition-colors"
      >
        {/* Risk dot */}
        <span
          className={`w-2.5 h-2.5 rounded-full shadow-lg flex-shrink-0 ${
            prediction.risk_label === "High Risk"
              ? "bg-red-500 shadow-red-500/50"
              : prediction.risk_label === "Medium Risk"
              ? "bg-amber-500 shadow-amber-500/50"
              : "bg-emerald-500 shadow-emerald-500/50"
          }`}
        />

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-white truncate">
            {prediction.guest_name}
          </div>
          <div className="text-[10px] text-slate-600 flex items-center gap-2">
            <span>{formatTime(record.timestamp)}</span>
            <span className="text-slate-700">•</span>
            <span className={record.source === "analyze" ? "text-indigo-500" : "text-violet-500"}>
              {record.source === "analyze" ? "Analyze" : "Tables"}
            </span>
          </div>
        </div>

        {/* Risk badge */}
        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${riskColor(prediction.risk_label)}`}>
          {riskScore}% {prediction.risk_label.replace(" Risk", "")}
        </span>

        {/* Expand chevron */}
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-600 flex-shrink-0" />
        )}
      </button>

      {/* Expanded Detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 border-t border-white/5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4">
                {/* Left: Input details */}
                <div className="md:col-span-4 space-y-3">
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Input Details</div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Party Size</span>
                      <span className="text-slate-300">{input.party_size}{input.children > 0 ? ` (+${input.children} kids)` : ""}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Channel</span>
                      <span className="text-slate-300">{input.booking_channel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Advance Days</span>
                      <span className="text-slate-300">{input.booking_advance_days}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Spend/Cover</span>
                      <span className="text-slate-300">${input.estimated_spend_per_cover}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cancellations</span>
                      <span className={`font-medium ${input.previous_cancellations > 2 ? "text-red-400" : "text-slate-300"}`}>
                        {input.previous_cancellations}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Completions</span>
                      <span className="text-emerald-400 font-medium">{input.previous_completions}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Repeat Guest</span>
                      <span className="text-slate-300">{input.is_repeat_guest ? "Yes" : "No"}</span>
                    </div>
                    {input.notes && (
                      <div className="pt-1">
                        <span className="text-slate-500">Notes:</span>
                        <p className="text-slate-400 mt-0.5 italic">{input.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Center: Risk Gauge */}
                <div className="md:col-span-3 flex flex-col items-center justify-center">
                  <RiskGauge value={riskScore} size={120} label={prediction.risk_label} />
                </div>

                {/* Right: Prediction results */}
                <div className="md:col-span-5 space-y-3">
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Results</div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <AITagBadge tag={prediction.ai_tag} />
                    <SpendBadge tier={prediction.spend_tag} />
                    <SentimentBadge sentiment={prediction.sentiment} />
                  </div>

                  {/* Explanation */}
                  {prediction.explanation && (
                    <div className="glass rounded-xl p-3">
                      <div className="text-[10px] text-slate-500 font-medium mb-1">Why this score</div>
                      <p className="text-xs text-slate-300">{prediction.explanation}</p>
                    </div>
                  )}

                  {/* Smart Tags */}
                  {prediction.smart_tags && prediction.smart_tags.length > 0 && (
                    <div>
                      <div className="text-[10px] text-slate-500 font-medium mb-1.5">Smart Tags</div>
                      <div className="flex flex-wrap gap-1">
                        {prediction.smart_tags.map((tag, i) => (
                          <NoteSmartTag key={`${tag.label}-${i}`} tag={tag} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Confidence */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500">Confidence</span>
                    <div className="flex-1 h-1.5 rounded-full bg-white/5">
                      <div
                        className="h-full rounded-full bg-indigo-500/60"
                        style={{ width: `${Math.round(prediction.confidence * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-indigo-400 font-medium">
                      {Math.round(prediction.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Delete button */}
              <div className="flex justify-end mt-3 pt-3 border-t border-white/5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(record.id);
                  }}
                  className="text-[10px] text-slate-600 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function HistoryPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");

  useEffect(() => {
    setRecords(getHistory());
  }, []);

  const handleDelete = (id: string) => {
    deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAll = () => {
    clearHistory();
    setRecords([]);
  };

  const filtered = records.filter((r) => {
    if (filter === "all") return true;
    if (filter === "high") return r.prediction.risk_label === "High Risk";
    if (filter === "medium") return r.prediction.risk_label === "Medium Risk";
    return r.prediction.risk_label === "Low Risk";
  });

  // Stats
  const highCount = records.filter((r) => r.prediction.risk_label === "High Risk").length;
  const medCount = records.filter((r) => r.prediction.risk_label === "Medium Risk").length;
  const lowCount = records.filter((r) => r.prediction.risk_label === "Low Risk").length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-400" />
          Analysis History
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {records.length} past {records.length === 1 ? "analysis" : "analyses"} stored locally
        </p>
      </motion.div>

      {records.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="mb-4">
          {/* Stats + filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(
                [
                  { key: "all", label: "All", count: records.length, active: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" },
                  { key: "high", label: "High", count: highCount, active: "bg-red-500/20 text-red-400 border-red-500/40" },
                  { key: "medium", label: "Medium", count: medCount, active: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
                  { key: "low", label: "Low", count: lowCount, active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
                ] as const
              ).map(({ key, label, count, active }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors border ${
                    filter === key
                      ? active
                      : "bg-white/[0.03] text-slate-500 border-white/5 hover:text-slate-300"
                  }`}
                >
                  {label}
                  <span className="ml-1 opacity-60">{count}</span>
                </button>
              ))}
            </div>

            <button
              onClick={handleClearAll}
              className="text-[11px] text-slate-600 hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          </div>
        </motion.div>
      )}

      {records.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass text-center py-20 text-slate-600">
          <Clock className="w-12 h-12 mx-auto mb-3" />
          <p className="text-sm mb-1">No analyses yet</p>
          <p className="text-xs text-slate-700">
            Run predictions from the Analyze or Tables pages to build your history
          </p>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass text-center py-16 text-slate-600">
          <Search className="w-10 h-10 mx-auto mb-3" />
          <p className="text-sm">No {filter} risk analyses found</p>
        </motion.div>
      ) : (
        <motion.div layout className="space-y-2">
          <AnimatePresence>
            {filtered.map((record) => (
              <HistoryRow key={record.id} record={record} onDelete={handleDelete} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
