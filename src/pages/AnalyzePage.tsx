import { useState } from "react";
import type { GuestPrediction, ReservationInput, DemoScenario } from "../lib/types";
import { predictGuestBehavior, getDemoScenarios } from "../lib/api";
import GuestInsightCard from "../components/GuestInsightCard";
import { Search, Play, Loader2 } from "lucide-react";

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
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search className="w-6 h-6 text-indigo-500" />
          Analyze Reservation
        </h1>
        <p className="text-gray-500 mt-1">
          Enter reservation details to get AI-powered guest insights
        </p>
      </div>

      {/* Demo Scenarios */}
      <div className="mb-6">
        <button
          onClick={loadDemos}
          className="btn-secondary text-sm flex items-center gap-1"
        >
          <Play className="w-3 h-3" />
          Load Demo Scenarios
        </button>
        {demos.length > 0 && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {demos.map((d) => (
              <button
                key={d.name}
                onClick={() => applyDemo(d)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                {d.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Form */}
        <form onSubmit={handleSubmit} className="col-span-3 card">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Guest Name
              </label>
              <input
                type="text"
                value={form.guest_name}
                onChange={(e) => update("guest_name", e.target.value)}
                className="input-field"
                placeholder="e.g. James Whitfield"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Party Size
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={form.party_size}
                onChange={(e) => update("party_size", Number(e.target.value))}
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Children
              </label>
              <input
                type="number"
                min={0}
                max={10}
                value={form.children}
                onChange={(e) => update("children", Number(e.target.value))}
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Advance Booking (days)
              </label>
              <input
                type="number"
                min={0}
                value={form.booking_advance_days}
                onChange={(e) =>
                  update("booking_advance_days", Number(e.target.value))
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Est. Spend/Cover ($)
              </label>
              <input
                type="number"
                min={0}
                step={5}
                value={form.estimated_spend_per_cover}
                onChange={(e) =>
                  update("estimated_spend_per_cover", Number(e.target.value))
                }
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Special Requests
              </label>
              <input
                type="number"
                min={0}
                value={form.special_needs_count}
                onChange={(e) =>
                  update("special_needs_count", Number(e.target.value))
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Channel
              </label>
              <select
                value={form.booking_channel}
                onChange={(e) => update("booking_channel", e.target.value)}
                className="input-field"
              >
                <option>Online</option>
                <option>Phone</option>
                <option>Walk-in</option>
                <option>App</option>
                <option>Corporate</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prev. Cancellations
              </label>
              <input
                type="number"
                min={0}
                value={form.previous_cancellations}
                onChange={(e) =>
                  update("previous_cancellations", Number(e.target.value))
                }
                className="input-field"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Prev. Completions
              </label>
              <input
                type="number"
                min={0}
                value={form.previous_completions}
                onChange={(e) =>
                  update("previous_completions", Number(e.target.value))
                }
                className="input-field"
              />
            </div>

            <div className="col-span-2 flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_repeat_guest}
                  onChange={(e) => update("is_repeat_guest", e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Repeat Guest
                </span>
              </label>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className="input-field"
                rows={3}
                placeholder="e.g. Birthday celebration. Severe nut allergy, carries epipen."
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            {loading ? "Analyzing..." : "Predict Guest Behavior"}
          </button>
        </form>

        {/* Result */}
        <div className="col-span-2">
          {prediction ? (
            <GuestInsightCard prediction={prediction} />
          ) : (
            <div className="card flex flex-col items-center justify-center text-center py-12 text-gray-400">
              <Search className="w-10 h-10 mb-3" />
              <p className="text-sm">
                Fill the form and click Predict to see guest insights
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
