import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GuestPrediction, SimulatedReservation } from "../lib/types";
import { simulateReservations, predictGuestBehavior } from "../lib/api";
import GuestInsightCard from "../components/GuestInsightCard";
import GuestDetailView from "../components/GuestDetailView";
import { Utensils, RefreshCw, Loader2, Eye, Users } from "lucide-react";

export default function TableViewPage() {
  const [reservations, setReservations] = useState<SimulatedReservation[]>([]);
  const [predictions, setPredictions] = useState<Map<string, GuestPrediction>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
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

  const predictForGuest = async (res: SimulatedReservation) => {
    if (predictions.has(res.reservation_id)) {
      setSelectedId(res.reservation_id);
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
      setSelectedId(res.reservation_id);
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
    return <span className={`w-2 h-2 rounded-full shadow-lg ${color}`} />;
  };

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.04 } },
  };
  const item = {
    hidden: { opacity: 0, x: -10 },
    show: { opacity: 1, x: 0 },
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Utensils className="w-6 h-6 text-indigo-400" />
            Table View
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Tonight's reservations — tap a guest for AI insights
          </p>
        </motion.div>
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={loadReservations}
          disabled={loading}
          className="btn-primary flex items-center gap-2 text-sm"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {reservations.length ? "Refresh" : "Load"}
        </motion.button>
      </div>

      {reservations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass text-center py-20 text-slate-600"
        >
          <Utensils className="w-12 h-12 mx-auto mb-3" />
          <p className="text-sm">
            Click "Load" to simulate tonight's table list
          </p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {/* Table List */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="md:col-span-3 space-y-2"
          >
            {reservations.map((res) => (
              <motion.button
                key={res.reservation_id}
                variants={item}
                onClick={() => predictForGuest(res)}
                className={`w-full text-left glass glass-hover p-4 flex items-center justify-between transition-all ${
                  selectedId === res.reservation_id
                    ? "border-indigo-500/50 glow-indigo"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {riskDot(res.reservation_id)}
                  <div>
                    <div className="font-medium text-sm text-white">
                      {res.guest_name}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Table {res.table_number} | Party of {res.party_size} |{" "}
                      {res.reservation_time}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {res.notes && (
                    <span className="hidden md:inline text-[10px] bg-white/5 text-slate-500 px-2 py-0.5 rounded-lg truncate max-w-[120px]">
                      {res.notes.slice(0, 25)}...
                    </span>
                  )}
                  {predicting === res.reservation_id ? (
                    <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 text-slate-600" />
                  )}
                </div>
              </motion.button>
            ))}
          </motion.div>

          {/* Desktop Prediction Panel (hidden on mobile — drawer used instead) */}
          <div className="hidden md:block md:col-span-2">
            <AnimatePresence mode="wait">
              {selectedId && predictions.has(selectedId) ? (
                <motion.div
                  key={selectedId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="sticky top-8"
                >
                  <GuestInsightCard prediction={predictions.get(selectedId)!} />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass text-center py-16 text-slate-600 sticky top-8"
                >
                  <Eye className="w-10 h-10 mx-auto mb-3" />
                  <p className="text-sm">
                    Click a reservation to see guest insights
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
          prediction={
            selectedId ? predictions.get(selectedId) ?? null : null
          }
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
        />
      </div>
    </div>
  );
}
