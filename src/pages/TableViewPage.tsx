import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GuestPrediction, SimulatedReservation } from "../lib/types";
import { simulateReservations, predictBatch, predictGuestBehavior } from "../lib/api";
import { saveAnalysis } from "../lib/historyStore";
import GuestInsightCard from "../components/GuestInsightCard";
import GuestDetailView from "../components/GuestDetailView";
import SmartActions from "../components/SmartActions";
import RiskGauge from "../components/RiskGauge";
import {
  Utensils,
  RefreshCw,
  Loader2,
  Eye,
  Users,
  Clock,
  Zap,
  AlertTriangle,
  Shield,
  CalendarDays,
} from "lucide-react";

function formatTonight(): string {
  const d = new Date();
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function TableViewPage() {
  const [reservations, setReservations] = useState<SimulatedReservation[]>([]);
  const [predictions, setPredictions] = useState<Map<string, GuestPrediction>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [predicting, setPredicting] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const loadReservations = async () => {
    setLoading(true);
    try {
      const data = await simulateReservations(15);
      setReservations(data);
      setPredictions(new Map());
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  const predictAll = useCallback(async () => {
    if (!reservations.length || batchLoading) return;
    setBatchLoading(true);
    try {
      const inputs = reservations.map((res) => ({
        guest_name: res.guest_name,
        party_size: res.party_size,
        children: res.children,
        booking_advance_days: res.booking_advance_days,
        special_needs_count: res.special_needs_count,
        is_repeat_guest: res.is_repeat_guest,
        estimated_spend_per_cover: res.estimated_spend_per_cover,
        reservation_date: res.reservation_date,
        previous_cancellations: res.previous_cancellations,
        previous_completions: res.previous_completions,
        booking_channel: res.booking_channel,
        notes: res.notes,
      }));
      const { predictions: results } = await predictBatch(inputs);
      const newMap = new Map<string, GuestPrediction>();
      results.forEach((p: GuestPrediction, i: number) => {
        newMap.set(reservations[i].reservation_id, p);
        saveAnalysis(reservations[i], p, "tables");
      });
      setPredictions(newMap);
    } finally {
      setBatchLoading(false);
    }
  }, [reservations, batchLoading]);

  const predictForGuest = async (res: SimulatedReservation) => {
    setSelectedId(res.reservation_id);

    if (predictions.has(res.reservation_id)) {
      setDetailOpen(true);
      return;
    }

    setPredicting(res.reservation_id);
    try {
      const prediction = await predictGuestBehavior(
        {
          guest_name: res.guest_name,
          party_size: res.party_size,
          children: res.children,
          booking_advance_days: res.booking_advance_days,
          special_needs_count: res.special_needs_count,
          is_repeat_guest: res.is_repeat_guest,
          estimated_spend_per_cover: res.estimated_spend_per_cover,
          reservation_date: res.reservation_date,
          previous_cancellations: res.previous_cancellations,
          previous_completions: res.previous_completions,
          booking_channel: res.booking_channel,
          notes: res.notes,
        },
        res.tenant_id
      );
      setPredictions((prev) =>
        new Map(prev).set(res.reservation_id, prediction)
      );
      saveAnalysis(res, prediction, "tables");
      setDetailOpen(true);
    } finally {
      setPredicting(null);
    }
  };

  const riskDot = (id: string) => {
    const p = predictions.get(id);
    if (!p) return null;
    const color =
      p.risk_label === "High Risk"
        ? "bg-red-500 shadow-red-500/50"
        : p.risk_label === "Medium Risk"
        ? "bg-amber-500 shadow-amber-500/50"
        : "bg-emerald-500 shadow-emerald-500/50";
    return <span className={`w-2.5 h-2.5 rounded-full shadow-lg ${color}`} />;
  };

  const riskBadge = (id: string) => {
    const p = predictions.get(id);
    if (!p) return null;
    const style =
      p.risk_label === "High Risk"
        ? "text-red-400 bg-red-500/10"
        : p.risk_label === "Medium Risk"
        ? "text-amber-400 bg-amber-500/10"
        : "text-emerald-400 bg-emerald-500/10";
    const score = p.ai_prediction?.risk_score ?? Math.round(p.no_show_risk * 100);
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${style}`}>
        {score}%
      </span>
    );
  };

  // Summary stats
  const predictedCount = predictions.size;
  const highRiskCount = Array.from(predictions.values()).filter(
    (p) => p.risk_label === "High Risk"
  ).length;
  const medRiskCount = Array.from(predictions.values()).filter(
    (p) => p.risk_label === "Medium Risk"
  ).length;

  const selectedPrediction = selectedId ? predictions.get(selectedId) ?? null : null;
  const selectedRiskScore = selectedPrediction
    ? selectedPrediction.ai_prediction?.risk_score ?? Math.round(selectedPrediction.no_show_risk * 100)
    : 0;

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.03 } },
  };
  const item = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 },
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Utensils className="w-6 h-6 text-indigo-400" />
            Tonight's Service
          </h1>
          <div className="flex items-center gap-2 mt-1">
            <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-slate-500 text-sm">{formatTonight()}</p>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2"
        >
          {reservations.length > 0 && (
            <button
              onClick={predictAll}
              disabled={batchLoading || predictions.size === reservations.length}
              className="btn-ghost text-sm flex items-center gap-1.5 disabled:opacity-40"
            >
              {batchLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5 text-indigo-400" />
              )}
              {batchLoading
                ? "Analyzing..."
                : predictions.size === reservations.length
                ? "All Analyzed"
                : "Predict All"}
            </button>
          )}
          <button
            onClick={loadReservations}
            disabled={loading}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {reservations.length ? "Refresh" : "Load Tonight"}
          </button>
        </motion.div>
      </div>

      {/* Summary Stats (shown after predictions exist) */}
      <AnimatePresence>
        {predictedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="glass p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 flex items-center justify-center">
                  <Users className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Guests</div>
                  <div className="text-sm font-bold text-white">{reservations.length}</div>
                </div>
              </div>
              <div className="glass p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Analyzed</div>
                  <div className="text-sm font-bold text-white">{predictedCount}/{reservations.length}</div>
                </div>
              </div>
              <div className="glass p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">High Risk</div>
                  <div className="text-sm font-bold text-red-400">{highRiskCount}</div>
                </div>
              </div>
              <div className="glass p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
                  <Eye className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-medium">Watch List</div>
                  <div className="text-sm font-bold text-amber-400">{medRiskCount}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {reservations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass text-center py-20 text-slate-600"
        >
          <Utensils className="w-12 h-12 mx-auto mb-3" />
          <p className="text-sm mb-1">No reservations loaded yet</p>
          <p className="text-xs text-slate-700">
            Click "Load Tonight" to simulate this evening's guests
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Reservation List */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="md:col-span-7 space-y-1.5"
          >
            {/* Column headers */}
            <div className="flex items-center gap-3 px-4 py-2 text-[10px] text-slate-600 font-medium uppercase tracking-wider">
              <span className="w-3" />
              <span className="flex-1">Guest</span>
              <span className="w-12 text-center hidden md:block">Table</span>
              <span className="w-14 text-center hidden md:block">Time</span>
              <span className="w-10 text-center hidden md:block">Party</span>
              <span className="w-14 text-center">Risk</span>
              <span className="w-5" />
            </div>

            {reservations.map((res) => {
              const isSelected = selectedId === res.reservation_id;
              const hasPrediction = predictions.has(res.reservation_id);
              const pred = predictions.get(res.reservation_id);
              const isHigh = pred?.risk_label === "High Risk";

              return (
                <motion.button
                  key={res.reservation_id}
                  variants={item}
                  onClick={() => predictForGuest(res)}
                  className={`w-full text-left glass glass-hover p-3.5 flex items-center gap-3 transition-all ${
                    isSelected ? "border-indigo-500/50" : ""
                  } ${isHigh ? "border-red-500/30" : ""}`}
                >
                  {hasPrediction ? riskDot(res.reservation_id) : (
                    <span className="w-2.5 h-2.5 rounded-full bg-white/10" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-white truncate">
                      {res.guest_name}
                      {res.is_repeat_guest && (
                        <span className="ml-1.5 text-[9px] text-indigo-400 font-semibold bg-indigo-500/10 px-1.5 py-0.5 rounded">
                          REPEAT
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-600 truncate">
                      {res.notes ? res.notes.slice(0, 40) : `via ${res.booking_channel}`}
                      {res.notes && res.notes.length > 40 ? "..." : ""}
                    </div>
                  </div>

                  <span className="w-12 text-center text-xs text-slate-400 font-medium hidden md:block">
                    T{res.table_number}
                  </span>

                  <span className="w-14 text-center hidden md:block">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3" />
                      {res.reservation_time}
                    </span>
                  </span>

                  <span className="w-10 text-center text-xs text-slate-400 hidden md:block">
                    {res.party_size}
                    {res.children > 0 && (
                      <span className="text-slate-600"> +{res.children}k</span>
                    )}
                  </span>

                  <span className="w-14 text-center">
                    {riskBadge(res.reservation_id)}
                  </span>

                  <span className="w-5">
                    {predicting === res.reservation_id ? (
                      <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    ) : (
                      <Eye className="w-4 h-4 text-slate-700" />
                    )}
                  </span>
                </motion.button>
              );
            })}
          </motion.div>

          {/* Right Panel: Prediction Detail */}
          <div className="hidden md:block md:col-span-5">
            <AnimatePresence mode="wait">
              {selectedPrediction ? (
                <motion.div
                  key={selectedId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="sticky top-8 space-y-4"
                >
                  {/* Risk Gauge */}
                  <div className="glass p-5 flex flex-col items-center">
                    <RiskGauge
                      value={selectedRiskScore}
                      size={160}
                      label={selectedPrediction.risk_label}
                    />
                  </div>
                  {/* Guest Insight Card */}
                  <GuestInsightCard prediction={selectedPrediction} />
                  {/* Smart Actions */}
                  <div className="glass p-4">
                    <SmartActions prediction={selectedPrediction} />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass text-center py-16 text-slate-600 sticky top-8"
                >
                  <Eye className="w-10 h-10 mx-auto mb-3" />
                  <p className="text-sm mb-1">Select a reservation</p>
                  <p className="text-xs text-slate-700">
                    Click any guest to see AI risk analysis
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Mobile Detail Drawer */}
      <div className="md:hidden">
        <GuestDetailView
          prediction={selectedPrediction}
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        />
      </div>
    </div>
  );
}
