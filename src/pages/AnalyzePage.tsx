import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GuestPrediction, ReservationInput, DemoScenario } from "../lib/types";
import { predictGuestBehavior, getDemoScenarios } from "../lib/api";
import GuestInsightCard from "../components/GuestInsightCard";
import { Search, Play, Loader2, Zap } from "lucide-react";

const EMPTY_FORM: ReservationInput = {
  guest_name: "",
  party_size: 2,
  children: 0,
  booking_advance_days: 0,
  special_needs_count: 0,
  is_repeat_guest: false,
  estimated_spend_per_cover: 80,
  reservation_date: "",
  previous_cancellations: 0,
  previous_completions: 0,
  booking_channel: "Online",
  notes: "",
};

export default function AnalyzePage() {
  const [form, setForm] = useState<ReservationInput>({ ...EMPTY_FORM });
  const [prediction, setPrediction] = useState<GuestPrediction | null>(null);
  const [loading, setLoading] = useState(false);
  const [demos, setDemos] = useState<DemoScenario[]>([]);
  const [error, setError] = useState("");

  const update = (field: keyof ReservationInput, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const loadDemos = async () => {
    if (demos.length) return;
    const data = await getDemoScenarios();
    setDemos(data);
  };

  const applyDemo = (demo: DemoScenario) => {
    setForm({ ...EMPTY_FORM, ...demo.reservation });
    setPrediction(null);
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guest_name.trim()) {
      setError("Guest name is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await predictGuestBehavior(form);
      setPrediction(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Search className="w-6 h-6 text-indigo-400" />
          Analyze Reservation
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Enter reservation details to get AI-powered guest insights
        </p>
      </motion.div>

      {/* Demo Scenarios */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6"
      >
        <button onClick={loadDemos} className="btn-ghost text-sm flex items-center gap-1.5">
          <Play className="w-3 h-3" />
          Load Demo Scenarios
        </button>
        <AnimatePresence>
          {demos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex gap-2 mt-3 flex-wrap"
            >
              {demos.map((d) => (
                <button
                  key={d.name}
                  onClick={() => applyDemo(d)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
                >
                  {d.name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Form */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="md:col-span-3 glass p-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Guest Name
              </label>
              <input
                type="text"
                value={form.guest_name}
                onChange={(e) => update("guest_name", e.target.value)}
                className="input-dark"
                placeholder="e.g. James Whitfield"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Party Size
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.party_size}
                onChange={(e) => update("party_size", Number(e.target.value))}
                className="input-dark"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Children
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.children}
                onChange={(e) => update("children", Number(e.target.value))}
                className="input-dark"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Advance Booking (days)
              </label>
              <input
                type="number"
                min={0}
                value={form.booking_advance_days}
                onChange={(e) => update("booking_advance_days", Number(e.target.value))}
                className="input-dark"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Est. Spend/Cover ($)
              </label>
              <input
                type="number"
                min={0}
                step={5}
                value={form.estimated_spend_per_cover}
                onChange={(e) => update("estimated_spend_per_cover", Number(e.target.value))}
                className="input-dark"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Special Requests
              </label>
              <input
                type="number"
                min={0}
                value={form.special_needs_count}
                onChange={(e) => update("special_needs_count", Number(e.target.value))}
                className="input-dark"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Channel
              </label>
              <select
                value={form.booking_channel}
                onChange={(e) => update("booking_channel", e.target.value)}
                className="input-dark"
              >
                <option>Online</option>
                <option>Phone</option>
                <option>Walk-in</option>
                <option>App</option>
                <option>Corporate</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Prev. Cancellations
              </label>
              <input
                type="number"
                min={0}
                value={form.previous_cancellations}
                onChange={(e) => update("previous_cancellations", Number(e.target.value))}
                className="input-dark"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Prev. Completions
              </label>
              <input
                type="number"
                min={0}
                value={form.previous_completions}
                onChange={(e) => update("previous_completions", Number(e.target.value))}
                className="input-dark"
              />
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={form.is_repeat_guest}
                    onChange={(e) => update("is_repeat_guest", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 rounded-full bg-white/10 peer-checked:bg-indigo-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-sm font-medium text-slate-400">
                  Repeat Guest
                </span>
              </label>
            </div>

            <div className="col-span-2">
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className="input-dark"
                rows={3}
                placeholder="e.g. Birthday celebration. Severe nut allergy, carries epipen."
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-5 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {loading ? "Analyzing..." : "Predict Guest Behavior"}
          </button>
        </motion.form>

        {/* Result */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="md:col-span-2"
        >
          <AnimatePresence mode="wait">
            {prediction ? (
              <GuestInsightCard key="result" prediction={prediction} />
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass flex flex-col items-center justify-center text-center py-16 text-slate-600"
              >
                <Search className="w-10 h-10 mb-3" />
                <p className="text-sm">
                  Fill the form and click Predict to see guest insights
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
