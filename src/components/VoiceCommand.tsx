import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2 } from "lucide-react";
import type { ReservationInput, GuestPrediction } from "../lib/types";
import { predictGuestBehavior } from "../lib/api";

// Simulated voice transcriptions (rotate through these)
const VOICE_TRANSCRIPTIONS = [
  {
    text: "Guest has a severe nut allergy and wants a quiet table for a birthday dinner",
    name: "Sarah Johnson",
    advance: 3,
    spend: 95,
    party: 4,
    special: 2,
  },
  {
    text: "VIP client celebrating anniversary. Window seat preferred. Halal only.",
    name: "Ahmed & Fatima Khan",
    advance: 7,
    spend: 180,
    party: 2,
    special: 3,
  },
  {
    text: "Large group, walk-in, three kids. One guest is vegan. Terrace if available.",
    name: "The Martinez Family",
    advance: 0,
    spend: 55,
    party: 8,
    children: 3,
    special: 2,
  },
  {
    text: "Corporate dinner, private booth needed, gluten free options required",
    name: "David Chen (TechCorp)",
    advance: 5,
    spend: 220,
    party: 6,
    special: 2,
  },
];

interface Props {
  onTranscription: (form: Partial<ReservationInput>) => void;
  onPrediction: (p: GuestPrediction) => void;
}

export default function VoiceCommand({ onTranscription, onPrediction }: Props) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [index, setIndex] = useState(0);

  const startListening = useCallback(async () => {
    if (listening || processing) return;

    setListening(true);
    setTranscript("");

    // Simulate 2-second "listening" phase
    await new Promise((r) => setTimeout(r, 2000));
    setListening(false);
    setProcessing(true);

    // Pick next transcription
    const sim = VOICE_TRANSCRIPTIONS[index % VOICE_TRANSCRIPTIONS.length];
    setIndex((i) => i + 1);

    // Typewriter effect for transcript
    let typed = "";
    for (let i = 0; i < sim.text.length; i++) {
      typed += sim.text[i];
      setTranscript(typed);
      await new Promise((r) => setTimeout(r, 20));
    }

    // Build the form and trigger prediction
    const formUpdate: Partial<ReservationInput> = {
      guest_name: sim.name,
      notes: sim.text,
      booking_advance_days: sim.advance,
      estimated_spend_per_cover: sim.spend,
      party_size: sim.party,
      children: (sim as Record<string, unknown>).children as number || 0,
      special_needs_count: sim.special,
    };

    onTranscription(formUpdate);

    try {
      const fullForm: ReservationInput = {
        guest_name: sim.name,
        party_size: sim.party,
        children: (sim as Record<string, unknown>).children as number || 0,
        booking_advance_days: sim.advance,
        special_needs_count: sim.special,
        is_repeat_guest: false,
        estimated_spend_per_cover: sim.spend,
        previous_cancellations: 0,
        previous_completions: 0,
        booking_channel: "Phone",
        notes: sim.text,
      };
      const result = await predictGuestBehavior(fullForm);
      onPrediction(result);
    } catch {
      // Handled silently
    } finally {
      setProcessing(false);
    }
  }, [listening, processing, index, onTranscription, onPrediction]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Mic Button */}
      <motion.button
        onClick={startListening}
        disabled={listening || processing}
        whileHover={{ scale: listening ? 1 : 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={`
          relative w-16 h-16 rounded-full flex items-center justify-center
          transition-all duration-300
          ${
            listening
              ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6),0_0_60px_rgba(239,68,68,0.3)]"
              : processing
              ? "bg-indigo-600 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
              : "bg-white/5 border border-white/10 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
          }
        `}
      >
        {/* Pulsing rings when listening */}
        <AnimatePresence>
          {listening && (
            <>
              <motion.div
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2.5, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-red-500/30"
              />
              <motion.div
                initial={{ scale: 1, opacity: 0.3 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                className="absolute inset-0 rounded-full bg-red-500/20"
              />
            </>
          )}
        </AnimatePresence>

        {processing ? (
          <Loader2 className="w-6 h-6 text-white animate-spin" />
        ) : listening ? (
          <MicOff className="w-6 h-6 text-white" />
        ) : (
          <Mic className="w-6 h-6 text-slate-400" />
        )}
      </motion.button>

      <span className="text-[10px] text-slate-600 font-medium">
        {listening ? "Listening..." : processing ? "Processing..." : "Tap to speak"}
      </span>

      {/* Transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="w-full glass rounded-xl p-3 mt-1"
          >
            <div className="text-[10px] text-slate-500 font-medium mb-1">
              Transcribed:
            </div>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              "{transcript}"
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
