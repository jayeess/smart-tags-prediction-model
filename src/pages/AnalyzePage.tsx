import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GuestPrediction, ReservationInput, DemoScenario } from "../lib/types";
import { predictGuestBehavior, getDemoScenarios } from "../lib/api";
import RiskGauge from "../components/RiskGauge";
import SmartActions from "../components/SmartActions";
import SimulatorControls from "../components/SimulatorControls";
import VoiceCommand from "../components/VoiceCommand";
import { NoteSmartTag, AITagBadge, SpendBadge, SentimentBadge, ConfidenceMeter } from "../components/SmartTagBadge";
import NumberStepper, { ChannelSelector } from "../components/NumberStepper";
import { Search, Play, Loader2, Zap, MessageSquare, Tags, Mic, Users, Baby, Sparkles, XCircle, CheckCircle2 } from "lucide-react";

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
  const [showVoice, setShowVoice] = useState(false);

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

  const handleSimPrediction = useCallback((p: GuestPrediction) => {
    setPrediction(p);
  }, []);

  const handleVoiceTranscription = useCallback((partial: Partial<ReservationInput>) => {
    setForm((prev) => ({ ...prev, ...partial }));
    setPrediction(null);
  }, []);

  const handleVoicePrediction = useCallback((p: GuestPrediction) => {
    setPrediction(p);
    setShowVoice(false);
  }, []);

  const riskScore = prediction
    ? prediction.ai_prediction?.risk_score ?? Math.round(prediction.no_show_risk * 100)
    : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
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
          Full prediction with Time-Travel Simulator and Smart Actions
        </p>
      </motion.div>

      {/* Demo Scenarios + Voice Toggle */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-6 flex items-center gap-2 flex-wrap"
      >
        <button onClick={loadDemos} className="btn-ghost text-sm flex items-center gap-1.5">
          <Play className="w-3 h-3" />
          Load Demos
        </button>
        <button
          onClick={() => setShowVoice(!showVoice)}
          className="btn-ghost text-sm flex items-center gap-1.5"
        >
          <Mic className="w-3 h-3" />
          {showVoice ? "Hide Voice" : "Voice Input"}
        </button>
        <AnimatePresence>
          {demos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              className="flex gap-2 flex-wrap"
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

      {/* Voice Command Panel */}
      <AnimatePresence>
        {showVoice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <div className="glass p-6">
              <VoiceCommand
                onTranscription={handleVoiceTranscription}
                onPrediction={handleVoicePrediction}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* ---- LEFT: Form ---- */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="md:col-span-5 glass p-6"
        >
          <div className="space-y-4">
            {/* Guest Name */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">Guest Name</label>
              <input
                type="text"
                value={form.guest_name}
                onChange={(e) => update("guest_name", e.target.value)}
                className="input-dark"
                placeholder="e.g. James Whitfield"
              />
            </div>

            {/* Party Size + Children — steppers with presets */}
            <div className="grid grid-cols-2 gap-3">
              <NumberStepper
                label="Party Size"
                icon={<Users className="w-3 h-3" />}
                value={form.party_size}
                onChange={(v) => update("party_size", v)}
                min={1}
                max={20}
                presets={[1, 2, 4, 6, 8]}
                accentColor="indigo"
              />
              <NumberStepper
                label="Children"
                icon={<Baby className="w-3 h-3" />}
                value={form.children}
                onChange={(v) => update("children", v)}
                min={0}
                max={10}
                presets={[0, 1, 2, 3]}
                accentColor="violet"
              />
            </div>

            {/* Special Requests */}
            <NumberStepper
              label="Special Requests"
              icon={<Sparkles className="w-3 h-3" />}
              value={form.special_needs_count}
              onChange={(v) => update("special_needs_count", v)}
              min={0}
              max={10}
              presets={[0, 1, 2, 3, 5]}
              accentColor="amber"
            />

            {/* Channel Selector */}
            <ChannelSelector
              value={form.booking_channel}
              onChange={(v) => update("booking_channel", v)}
            />

            {/* Cancellations + Completions */}
            <div className="grid grid-cols-2 gap-3">
              <NumberStepper
                label="Prev. Cancellations"
                icon={<XCircle className="w-3 h-3" />}
                value={form.previous_cancellations}
                onChange={(v) => update("previous_cancellations", v)}
                min={0}
                max={20}
                presets={[0, 1, 3, 5]}
                accentColor="red"
              />
              <NumberStepper
                label="Prev. Completions"
                icon={<CheckCircle2 className="w-3 h-3" />}
                value={form.previous_completions}
                onChange={(v) => update("previous_completions", v)}
                min={0}
                max={50}
                presets={[0, 2, 5, 10]}
                accentColor="emerald"
              />
            </div>

            {/* Repeat Guest Toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <div className="relative">
                  <input type="checkbox" checked={form.is_repeat_guest} onChange={(e) => update("is_repeat_guest", e.target.checked)} className="sr-only peer" />
                  <div className="w-9 h-5 rounded-full bg-white/10 peer-checked:bg-indigo-600 transition-colors" />
                  <div className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-sm font-medium text-slate-400">Repeat Guest</span>
              </label>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1.5">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                className="input-dark"
                rows={2}
                placeholder="e.g. Birthday celebration. Severe nut allergy."
              />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-4 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {loading ? "Analyzing..." : "Predict Guest Behavior"}
          </button>
        </motion.form>

        {/* ---- CENTER: Simulator + Gauge ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="md:col-span-3 space-y-4"
        >
          {/* Simulator Sliders */}
          <SimulatorControls
            form={form}
            onFormChange={update}
            onPrediction={handleSimPrediction}
          />

          {/* Risk Gauge */}
          <div className="glass p-5 flex flex-col items-center">
            <RiskGauge
              value={riskScore}
              size={160}
              label={prediction?.risk_label}
            />
          </div>
        </motion.div>

        {/* ---- RIGHT: Results ---- */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="md:col-span-4 space-y-4"
        >
          <AnimatePresence mode="wait">
            {prediction ? (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                {/* Header */}
                <div className="glass p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-white">{prediction.guest_name}</h3>
                    <AITagBadge tag={prediction.ai_tag} />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <SpendBadge tier={prediction.spend_tag} />
                    <SentimentBadge sentiment={prediction.sentiment} />
                  </div>

                  {/* Explanation */}
                  {prediction.explanation && (
                    <div className="glass rounded-xl p-3 mb-3">
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium mb-1">
                        <MessageSquare className="w-3 h-3" />
                        Why this score
                      </div>
                      <p className="text-xs text-slate-300">{prediction.explanation}</p>
                    </div>
                  )}

                  {/* Confidence */}
                  <ConfidenceMeter value={prediction.confidence} />
                </div>

                {/* Smart Tags */}
                {prediction.smart_tags && prediction.smart_tags.length > 0 && (
                  <div className="glass p-5">
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium mb-2">
                      <Tags className="w-3 h-3" />
                      Detected Tags
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {prediction.smart_tags.map((tag, i) => (
                        <NoteSmartTag key={`${tag.label}-${i}`} tag={tag} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Smart Actions */}
                <div className="glass p-5">
                  <SmartActions prediction={prediction} />
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="glass flex flex-col items-center justify-center text-center py-20 text-slate-600"
              >
                <Search className="w-10 h-10 mb-3" />
                <p className="text-sm">Fill the form and predict,</p>
                <p className="text-sm">or drag the sliders to simulate</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}
