import { useState } from "react";
import type {
  GuestPrediction,
  ReservationInput,
  DemoScenario,
  AnalyzeTagsV2Response,
  PipelineTag,
} from "../lib/types";
import { predictGuestBehavior, getDemoScenarios, analyzeTagsV2 } from "../lib/api";
import GuestInsightCard from "../components/GuestInsightCard";
import { Search, Play, Loader2, ChevronDown, ChevronUp, Tag } from "lucide-react";

const URGENCY_COLOR: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-gray-100 text-gray-700 border-gray-300",
};

const CATEGORY_COLOR: Record<string, string> = {
  dietary: "bg-red-50 text-red-700 border-red-200",
  occasion: "bg-indigo-50 text-indigo-700 border-indigo-200",
  accessibility: "bg-purple-50 text-purple-700 border-purple-200",
  preference: "bg-sky-50 text-sky-700 border-sky-200",
  vip: "bg-amber-50 text-amber-700 border-amber-200",
  operational: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function TagChip({ tag }: { tag: PipelineTag }) {
  const colorClass = CATEGORY_COLOR[tag.category] ?? "bg-gray-50 text-gray-700 border-gray-200";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
      title={tag.evidence_span ? `"${tag.evidence_span}" · ${tag.source}` : tag.source}
    >
      <span>{tag.provenance_icon}</span>
      {tag.tag}
    </span>
  );
}

function PipelineTagsPanel({ result }: { result: AnalyzeTagsV2Response }) {
  if (result.tags.length === 0) return null;
  const urgencyClass = URGENCY_COLOR[result.urgency] ?? URGENCY_COLOR.low;
  return (
    <div className="card mt-4 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Tag className="w-4 h-4 text-indigo-400" />
          Smart Tags
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full border font-medium ${urgencyClass}`}
          >
            {result.urgency} urgency
          </span>
          {!result.llm_used && (
            <span className="text-xs text-gray-400 italic">fallback mode</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {result.tags.map((t, i) => (
          <TagChip key={i} tag={t} />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        📝 form&nbsp; 🤖 AI&nbsp; 📜 history&nbsp; ⚠️ fallback
      </p>
    </div>
  );
}

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
  const [tagsV2, setTagsV2] = useState<AnalyzeTagsV2Response | null>(null);
  const [loading, setLoading] = useState(false);
  const [demos, setDemos] = useState<DemoScenario[]>([]);
  const [error, setError] = useState("");
  const [quickTagsOpen, setQuickTagsOpen] = useState(false);
  const [quickTags, setQuickTags] = useState<AnalyzeTagsV2Response | null>(null);
  const [quickTagsLoading, setQuickTagsLoading] = useState(false);

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
    setTagsV2(null);
    setQuickTags(null);
    setError("");
  };

  const detectQuickTags = async () => {
    if (!form.notes.trim()) return;
    setQuickTagsLoading(true);
    try {
      const result = await analyzeTagsV2(form.notes, {
        party_size: form.party_size,
        children: form.children,
        is_repeat_guest: form.is_repeat_guest,
        previous_completions: form.previous_completions,
      });
      setQuickTags(result);
      setQuickTagsOpen(true);
    } catch {
      // silently ignore — quick tags are optional
    } finally {
      setQuickTagsLoading(false);
    }
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
      const [predResult, tagsResult] = await Promise.allSettled([
        predictGuestBehavior(form),
        analyzeTagsV2(form.notes, {
          party_size: form.party_size,
          children: form.children,
          is_repeat_guest: form.is_repeat_guest,
          previous_completions: form.previous_completions,
        }),
      ]);
      if (predResult.status === "fulfilled") {
        setPrediction(predResult.value);
      } else {
        throw predResult.reason;
      }
      if (tagsResult.status === "fulfilled") {
        setTagsV2(tagsResult.value);
      }
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
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Notes
                </label>
                <button
                  type="button"
                  onClick={detectQuickTags}
                  disabled={!form.notes.trim() || quickTagsLoading}
                  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 disabled:text-gray-400"
                >
                  {quickTagsLoading ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Tag className="w-3 h-3" />
                  )}
                  Quick tags
                  {quickTags && (
                    quickTagsOpen
                      ? <ChevronUp className="w-3 h-3" />
                      : <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>
              <textarea
                value={form.notes}
                onChange={(e) => {
                  update("notes", e.target.value);
                  setQuickTags(null);
                  setQuickTagsOpen(false);
                }}
                className="input-field"
                rows={3}
                placeholder="e.g. Birthday celebration. Severe nut allergy, carries epipen."
              />
              {quickTags && quickTagsOpen && quickTags.tags.length > 0 && (
                <div className="mt-2 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex flex-wrap gap-1">
                    {quickTags.tags.map((t, i) => (
                      <TagChip key={i} tag={t} />
                    ))}
                  </div>
                </div>
              )}
              {quickTags && quickTagsOpen && quickTags.tags.length === 0 && (
                <p className="mt-1 text-xs text-gray-400">No tags detected in notes.</p>
              )}
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
            <>
              <GuestInsightCard prediction={prediction} />
              {tagsV2 && <PipelineTagsPanel result={tagsV2} />}
            </>
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
