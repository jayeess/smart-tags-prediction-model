import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock,
  Trash2,
  Search,
  ChevronDown,
  Download,
  AlertTriangle,
  SearchX,
} from "lucide-react";
import {
  getHistory,
  clearHistory,
  deleteRecord,
  type AnalysisRecord,
} from "../lib/historyStore";
import {
  NoteSmartTag,
  AITagBadge,
  SpendBadge,
  SentimentBadge,
} from "../components/SmartTagBadge";
import RiskGauge from "../components/RiskGauge";

/* ─── Helpers ───────────────────────────────────────────── */

function riskColor(label: string) {
  if (label === "High Risk")
    return "text-red-400 bg-red-500/10 border-red-500/20";
  if (label === "Medium Risk")
    return "text-amber-400 bg-amber-500/10 border-amber-500/20";
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

function dateGroup(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const recordDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (recordDay.getTime() === today.getTime()) return "Today";
  if (recordDay.getTime() === yesterday.getTime()) return "Yesterday";
  const diffDays = Math.floor(
    (today.getTime() - recordDay.getTime()) / 86400000
  );
  if (diffDays < 7) return "This Week";
  return "Earlier";
}

function safeRiskScore(prediction: AnalysisRecord["prediction"]): number {
  if (prediction.ai_prediction?.risk_score != null) {
    return prediction.ai_prediction.risk_score;
  }
  if (prediction.no_show_risk != null) {
    return Math.round(prediction.no_show_risk * 100);
  }
  return 0;
}

function exportCSV(records: AnalysisRecord[]) {
  const header =
    "Timestamp,Guest Name,Risk Score,Risk Label,Confidence,Spend Tier,Sentiment,Channel,Party Size,Advance Days,Cancellations,Completions,Source\n";
  const rows = records
    .map((r) => {
      const p = r.prediction;
      const inp = r.input;
      return [
        r.timestamp,
        `"${p.guest_name}"`,
        safeRiskScore(p),
        p.risk_label,
        Math.round((p.confidence ?? 0) * 100) + "%",
        p.spend_tag,
        p.sentiment?.label ?? "unknown",
        inp?.booking_channel ?? "",
        inp?.party_size ?? "",
        inp?.booking_advance_days ?? "",
        inp?.previous_cancellations ?? "",
        inp?.previous_completions ?? "",
        r.source,
      ].join(",");
    })
    .join("\n");

  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `emenu-analysis-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── HistoryRow ─────────────────────────────────────── */

function HistoryRow({
  record,
  onDelete,
}: {
  record: AnalysisRecord;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { prediction, input } = record;
  const riskScore = safeRiskScore(prediction);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
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
          <div className="text-[10px] text-slate-600 flex items-center gap-2 mt-0.5">
            <span>{formatTime(record.timestamp)}</span>
            <span className="text-slate-700">&middot;</span>
            <span
              className={
                record.source === "analyze"
                  ? "text-indigo-500"
                  : "text-violet-500"
              }
            >
              {record.source === "analyze" ? "Analyze" : "Tables"}
            </span>
            {prediction.smart_tags && prediction.smart_tags.length > 0 && (
              <>
                <span className="text-slate-700">&middot;</span>
                <span className="text-slate-500">
                  {prediction.smart_tags.length} tag
                  {prediction.smart_tags.length > 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Risk badge */}
        <span
          className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${riskColor(
            prediction.risk_label
          )}`}
        >
          {riskScore}% {prediction.risk_label.replace(" Risk", "")}
        </span>

        {/* Expand chevron */}
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-slate-600 flex-shrink-0" />
        </motion.div>
      </button>

      {/* Expanded Detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pb-4 border-t border-white/5">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-4">
                {/* Left: Input details */}
                <div className="md:col-span-4 space-y-3">
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    Input Details
                  </div>
                  <div className="space-y-1.5 text-xs">
                    {[
                      {
                        label: "Party Size",
                        value: `${input?.party_size ?? 2}${
                          input?.children > 0
                            ? ` (+${input.children} kids)`
                            : ""
                        }`,
                      },
                      {
                        label: "Channel",
                        value: input?.booking_channel ?? "Online",
                      },
                      {
                        label: "Advance Days",
                        value: String(input?.booking_advance_days ?? 0),
                      },
                      {
                        label: "Spend/Cover",
                        value: `$${input?.estimated_spend_per_cover ?? 80}`,
                      },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-slate-500">{label}</span>
                        <span className="text-slate-300">{value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cancellations</span>
                      <span
                        className={`font-medium ${
                          (input?.previous_cancellations ?? 0) > 2
                            ? "text-red-400"
                            : "text-slate-300"
                        }`}
                      >
                        {input?.previous_cancellations ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Completions</span>
                      <span className="text-emerald-400 font-medium">
                        {input?.previous_completions ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Repeat Guest</span>
                      <span className="text-slate-300">
                        {input?.is_repeat_guest ? "Yes" : "No"}
                      </span>
                    </div>
                    {input?.notes && (
                      <div className="pt-1">
                        <span className="text-slate-500">Notes:</span>
                        <p className="text-slate-400 mt-0.5 italic">
                          {input.notes}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Center: Risk Gauge */}
                <div className="md:col-span-3 flex flex-col items-center justify-center">
                  <RiskGauge
                    value={riskScore}
                    size={120}
                    label={prediction.risk_label}
                  />
                </div>

                {/* Right: Prediction results */}
                <div className="md:col-span-5 space-y-3">
                  <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                    Results
                  </div>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {prediction.ai_tag && (
                      <AITagBadge tag={prediction.ai_tag} />
                    )}
                    {prediction.spend_tag && (
                      <SpendBadge tier={prediction.spend_tag} />
                    )}
                    {prediction.sentiment && (
                      <SentimentBadge sentiment={prediction.sentiment} />
                    )}
                  </div>

                  {/* Explanation */}
                  {prediction.explanation && (
                    <div className="glass rounded-xl p-3">
                      <div className="text-[10px] text-slate-500 font-medium mb-1">
                        Why this score
                      </div>
                      <p className="text-xs text-slate-300">
                        {prediction.explanation}
                      </p>
                    </div>
                  )}

                  {/* Smart Tags */}
                  {prediction.smart_tags &&
                    prediction.smart_tags.length > 0 && (
                      <div>
                        <div className="text-[10px] text-slate-500 font-medium mb-1.5">
                          Smart Tags
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {prediction.smart_tags.map((tag, i) => (
                            <NoteSmartTag
                              key={`${tag.label}-${i}`}
                              tag={tag}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                  {/* Confidence */}
                  {prediction.confidence != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">
                        Confidence
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-indigo-500/60 transition-all duration-500"
                          style={{
                            width: `${Math.round(prediction.confidence * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] text-indigo-400 font-medium">
                        {Math.round(prediction.confidence * 100)}%
                      </span>
                    </div>
                  )}
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

/* ─── Main Page ──────────────────────────────────────── */

export default function HistoryPage() {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">(
    "all"
  );
  const [search, setSearch] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    setRecords(getHistory());
  }, []);

  const handleDelete = (id: string) => {
    deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAll = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    clearHistory();
    setRecords([]);
    setConfirmClear(false);
  };

  // Stats
  const highCount = records.filter(
    (r) => r.prediction.risk_label === "High Risk"
  ).length;
  const medCount = records.filter(
    (r) => r.prediction.risk_label === "Medium Risk"
  ).length;
  const lowCount = records.filter(
    (r) => r.prediction.risk_label === "Low Risk"
  ).length;

  // Filtered + searched
  const filtered = useMemo(() => {
    let result = records;
    if (filter !== "all") {
      const labelMap = {
        high: "High Risk",
        medium: "Medium Risk",
        low: "Low Risk",
      };
      result = result.filter(
        (r) => r.prediction.risk_label === labelMap[filter]
      );
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (r) =>
          r.prediction.guest_name.toLowerCase().includes(q) ||
          (r.input?.notes ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [records, filter, search]);

  // Group by date
  const grouped = useMemo(() => {
    const groups: { label: string; items: AnalysisRecord[] }[] = [];
    let currentLabel = "";
    for (const r of filtered) {
      const label = dateGroup(r.timestamp);
      if (label !== currentLabel) {
        groups.push({ label, items: [r] });
        currentLabel = label;
      } else {
        groups[groups.length - 1].items.push(r);
      }
    }
    return groups;
  }, [filtered]);

  // Risk distribution bar
  const total = records.length;
  const highPct = total > 0 ? (highCount / total) * 100 : 0;
  const medPct = total > 0 ? (medCount / total) * 100 : 0;
  const lowPct = total > 0 ? (lowCount / total) * 100 : 0;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Clock className="w-6 h-6 text-indigo-400" />
          Analysis History
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {records.length} past{" "}
          {records.length === 1 ? "analysis" : "analyses"} stored locally
        </p>
      </motion.div>

      {records.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-4 mb-5"
        >
          {/* Risk Distribution Bar */}
          <div className="glass p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                Risk Distribution
              </span>
              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-slate-500">
                    High {highCount}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-slate-500">
                    Medium {medCount}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-slate-500">
                    Low {lowCount}
                  </span>
                </span>
              </div>
            </div>
            <div className="h-2.5 rounded-full bg-white/5 flex overflow-hidden">
              {highPct > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${highPct}%` }}
                  transition={{ duration: 0.6, delay: 0.2 }}
                  className="h-full bg-red-500"
                />
              )}
              {medPct > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${medPct}%` }}
                  transition={{ duration: 0.6, delay: 0.3 }}
                  className="h-full bg-amber-500"
                />
              )}
              {lowPct > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${lowPct}%` }}
                  transition={{ duration: 0.6, delay: 0.4 }}
                  className="h-full bg-emerald-500"
                />
              )}
            </div>
          </div>

          {/* Filters + Search + Actions */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  {
                    key: "all" as const,
                    label: "All",
                    count: records.length,
                    active:
                      "bg-indigo-500/20 text-indigo-400 border-indigo-500/40",
                  },
                  {
                    key: "high" as const,
                    label: "High",
                    count: highCount,
                    active: "bg-red-500/20 text-red-400 border-red-500/40",
                  },
                  {
                    key: "medium" as const,
                    label: "Medium",
                    count: medCount,
                    active:
                      "bg-amber-500/20 text-amber-400 border-amber-500/40",
                  },
                  {
                    key: "low" as const,
                    label: "Low",
                    count: lowCount,
                    active:
                      "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                  },
                ]
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

            <div className="flex items-center gap-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
                <input
                  type="text"
                  placeholder="Search guest..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 rounded-xl text-[11px] bg-white/[0.03] border border-white/5 text-slate-300 placeholder-slate-600 focus:ring-1 focus:ring-indigo-500/40 outline-none w-40"
                />
              </div>

              {/* Export */}
              <button
                onClick={() => exportCSV(records)}
                className="p-1.5 rounded-lg bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors"
                title="Export as CSV"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* Clear All */}
              <button
                onClick={handleClearAll}
                className={`text-[11px] flex items-center gap-1 px-2.5 py-1.5 rounded-xl border transition-all ${
                  confirmClear
                    ? "text-red-400 bg-red-500/10 border-red-500/30"
                    : "text-slate-600 border-transparent hover:text-red-400"
                }`}
              >
                {confirmClear ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : (
                  <Trash2 className="w-3 h-3" />
                )}
                {confirmClear ? "Confirm Clear?" : "Clear All"}
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Content */}
      {records.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass text-center py-20"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
            <Clock className="w-8 h-8 text-indigo-400/60" />
          </div>
          <p className="text-sm text-slate-400 mb-1">No analyses yet</p>
          <p className="text-xs text-slate-600 mb-4">
            Run predictions from the Analyze or Tables pages to build your
            history
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/analyze"
              className="btn-primary text-xs px-4 py-2"
            >
              Analyze a Guest
            </Link>
            <Link
              to="/tables"
              className="btn-ghost text-xs"
            >
              Tonight's Tables
            </Link>
          </div>
        </motion.div>
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass text-center py-16"
        >
          <SearchX className="w-10 h-10 mx-auto mb-3 text-slate-600" />
          <p className="text-sm text-slate-400">
            {search
              ? `No results for "${search}"`
              : `No ${filter} risk analyses found`}
          </p>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs text-indigo-400 mt-2 hover:underline"
            >
              Clear search
            </button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.label}>
              {/* Date group header */}
              <div className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-2 pl-1">
                {group.label}
              </div>
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {group.items.map((record) => (
                    <HistoryRow
                      key={record.id}
                      record={record}
                      onDelete={handleDelete}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
