import { useState } from "react";
import type { GuestPrediction, SimulatedReservation } from "../lib/types";
import { simulateReservations, predictGuestBehavior } from "../lib/api";
import GuestInsightCard from "../components/GuestInsightCard";
import { Utensils, RefreshCw, Loader2, Eye } from "lucide-react";

export default function TableViewPage() {
  const [reservations, setReservations] = useState<SimulatedReservation[]>([]);
  const [predictions, setPredictions] = useState<Map<string, GuestPrediction>>(
    new Map()
  );
  const [loading, setLoading] = useState(false);
  const [predicting, setPredicting] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      setPredictions((prev) => new Map(prev).set(res.reservation_id, prediction));
      setSelectedId(res.reservation_id);
    } finally {
      setPredicting(null);
    }
  };

  const riskDot = (id: string) => {
    const p = predictions.get(id);
    if (!p) return null;
    const color =
      p.risk_label === "High Risk"
        ? "bg-red-500"
        : p.risk_label === "Medium Risk"
        ? "bg-amber-500"
        : "bg-emerald-500";
    return <span className={`w-2 h-2 rounded-full ${color}`} />;
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Utensils className="w-6 h-6 text-indigo-500" />
            Table View
          </h1>
          <p className="text-gray-500 mt-1">
            Simulated tonight's reservations — click a guest to fetch predictions
          </p>
        </div>
        <button
          onClick={loadReservations}
          disabled={loading}
          className="btn-primary flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {reservations.length ? "Refresh" : "Load Reservations"}
        </button>
      </div>

      {reservations.length === 0 ? (
        <div className="card text-center py-16 text-gray-400">
          <Utensils className="w-12 h-12 mx-auto mb-3" />
          <p>Click "Load Reservations" to simulate tonight's table list</p>
        </div>
      ) : (
        <div className="grid grid-cols-5 gap-6">
          {/* Table List */}
          <div className="col-span-3 space-y-2">
            {reservations.map((res) => (
              <button
                key={res.reservation_id}
                onClick={() => predictForGuest(res)}
                className={`w-full text-left card p-4 flex items-center justify-between hover:border-indigo-200 transition-colors ${
                  selectedId === res.reservation_id
                    ? "border-indigo-400 ring-1 ring-indigo-200"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  {riskDot(res.reservation_id)}
                  <div>
                    <div className="font-medium text-sm">{res.guest_name}</div>
                    <div className="text-xs text-gray-400">
                      Table {res.table_number} | Party of {res.party_size} |{" "}
                      {res.reservation_time}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {res.notes && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full truncate max-w-[120px]">
                      {res.notes.slice(0, 25)}...
                    </span>
                  )}
                  {predicting === res.reservation_id ? (
                    <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-300" />
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Prediction Panel */}
          <div className="col-span-2">
            {selectedId && predictions.has(selectedId) ? (
              <div className="sticky top-8">
                <GuestInsightCard prediction={predictions.get(selectedId)!} />
              </div>
            ) : (
              <div className="card text-center py-12 text-gray-400 sticky top-8">
                <Eye className="w-10 h-10 mx-auto mb-3" />
                <p className="text-sm">
                  Click a reservation to see guest insights
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
