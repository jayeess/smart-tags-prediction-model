import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, AlertCircle, RefreshCw, User, Users, FileText } from "lucide-react";
import type { ReservationInput, GuestPrediction } from "../lib/types";
import { predictGuestBehavior } from "../lib/api";

/* ── Speech Recognition types ────────────────────────────── */
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
type SpeechRecognitionType = new () => SpeechRecognitionInstance;
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onspeechstart: (() => void) | null;
}

function getSpeechRecognition(): SpeechRecognitionType | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionType | null;
}

/* ── NLP: extract structured data from spoken text ────────── */
function parseTranscript(text: string): {
  guest_name: string;
  party_size: number;
  children: number;
  notes: string;
  extracted: { field: string; value: string }[];
} {
  const lower = text.toLowerCase();
  const extracted: { field: string; value: string }[] = [];
  let guest_name = "";
  let party_size = 2;
  let children = 0;

  // Extract guest name: "for John Smith", "name is John", "reservation for Smith", "booking for Alice"
  const namePatterns = [
    /(?:for|name\s+is|guest\s+(?:name\s+)?(?:is\s+)?|booking\s+for|reservation\s+for)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    /^([A-Z][a-z]+\s+[A-Z][a-z]+)/,
  ];
  for (const pattern of namePatterns) {
    const nameMatch = text.match(pattern);
    if (nameMatch) {
      guest_name = nameMatch[1].trim();
      extracted.push({ field: "Guest", value: guest_name });
      break;
    }
  }

  // Extract party size: "party of 4", "table for 6", "4 people", "4 guests"
  const partyPatterns = [
    /(?:party\s+of|table\s+for|group\s+of)\s+(\d+)/i,
    /(\d+)\s+(?:people|guests|persons|pax|covers)/i,
  ];
  for (const pattern of partyPatterns) {
    const partyMatch = lower.match(pattern);
    if (partyMatch) {
      party_size = Math.min(20, Math.max(1, parseInt(partyMatch[1])));
      extracted.push({ field: "Party", value: `${party_size} guests` });
      break;
    }
  }

  // Extract children: "2 children", "3 kids", "with children"
  const childMatch = lower.match(/(\d+)\s+(?:children|kids|child)/i);
  if (childMatch) {
    children = Math.min(10, parseInt(childMatch[1]));
    extracted.push({ field: "Children", value: `${children}` });
  } else if (/with\s+(?:children|kids|a\s+child)/i.test(lower)) {
    children = 1;
    extracted.push({ field: "Children", value: "1" });
  }

  // The entire transcript becomes notes (smart tags will pick up keywords)
  const notes = text.trim();
  if (notes) {
    extracted.push({ field: "Notes", value: notes.length > 40 ? notes.slice(0, 40) + "..." : notes });
  }

  return { guest_name: guest_name || "Voice Guest", party_size, children, notes, extracted };
}

/* ── Component ───────────────────────────────────────────── */
type VoiceState = "idle" | "listening" | "processing" | "done";

interface Props {
  onTranscription: (form: Partial<ReservationInput>) => void;
  onPrediction: (p: GuestPrediction) => void;
  compact?: boolean;
}

export default function VoiceCommand({ onTranscription, onPrediction, compact }: Props) {
  const [state, setState] = useState<VoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [extracted, setExtracted] = useState<{ field: string; value: string }[]>([]);
  const [speechDetected, setSpeechDetected] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const errorTimer = useRef<ReturnType<typeof setTimeout>>();

  const supported = !!getSpeechRecognition();

  // Auto-clear errors after 5 seconds
  useEffect(() => {
    if (error) {
      errorTimer.current = setTimeout(() => setError(""), 5000);
      return () => { if (errorTimer.current) clearTimeout(errorTimer.current); };
    }
  }, [error]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const startListening = useCallback(async () => {
    if (state === "listening" || state === "processing") return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError("Speech recognition not supported. Use Chrome or Edge.");
      return;
    }

    setError("");
    setTranscript("");
    setExtracted([]);
    setSpeechDetected(false);

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onstart = () => {
      setState("listening");
    };

    recognition.onspeechstart = () => {
      setSpeechDetected(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event: Event & { error: string }) => {
      if (event.error === "no-speech") {
        setError("No speech detected. Tap the mic and speak clearly.");
      } else if (event.error === "not-allowed") {
        setError("Microphone access denied. Please allow mic permissions in your browser settings.");
      } else if (event.error === "network") {
        setError("Network error. Check your connection and try again.");
      } else if (event.error !== "aborted") {
        setError(`Speech error: ${event.error}`);
      }
      setState("idle");
      recognitionRef.current = null;
    };

    recognition.onend = async () => {
      recognitionRef.current = null;
      const spokenText = finalTranscript.trim();

      if (!spokenText) {
        setState("idle");
        return;
      }

      setState("processing");

      // Parse the transcript for structured data
      const parsed = parseTranscript(spokenText);
      setExtracted(parsed.extracted);

      const formUpdate: Partial<ReservationInput> = {
        guest_name: parsed.guest_name,
        party_size: parsed.party_size,
        children: parsed.children,
        notes: parsed.notes,
      };
      onTranscription(formUpdate);

      try {
        const fullForm: ReservationInput = {
          guest_name: parsed.guest_name,
          party_size: parsed.party_size,
          children: parsed.children,
          booking_advance_days: 1,
          special_needs_count: 0,
          is_repeat_guest: false,
          estimated_spend_per_cover: 80,
          previous_cancellations: 0,
          previous_completions: 0,
          booking_channel: "Phone",
          notes: parsed.notes,
        };
        const result = await predictGuestBehavior(fullForm);
        onPrediction(result);
        setState("done");
      } catch {
        setError("Prediction failed. Check API connection.");
        setState("idle");
      }
    };

    try {
      recognition.start();
    } catch {
      setError("Could not start speech recognition. Please try again.");
      setState("idle");
    }
  }, [state, onTranscription, onPrediction]);

  const reset = () => {
    setState("idle");
    setTranscript("");
    setExtracted([]);
    setError("");
    setSpeechDetected(false);
  };

  // Waveform bars for listening animation
  const WaveformBars = () => (
    <div className="flex items-end gap-[3px] h-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full bg-red-400"
          animate={{
            height: speechDetected
              ? [8, 16 + Math.random() * 4, 6, 20, 10]
              : [4, 8, 4, 8, 4],
          }}
          transition={{
            duration: speechDetected ? 0.4 : 0.8,
            repeat: Infinity,
            delay: i * 0.08,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );

  const buttonSize = compact ? "w-14 h-14" : "w-16 h-16";
  const iconSize = compact ? "w-5 h-5" : "w-6 h-6";

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Mic Button */}
      <div className="relative">
        <motion.button
          onClick={state === "listening" ? stopListening : state === "done" ? reset : startListening}
          disabled={state === "processing" || !supported}
          whileHover={{ scale: state === "listening" ? 1 : 1.05 }}
          whileTap={{ scale: 0.92 }}
          className={`
            relative ${buttonSize} rounded-full flex items-center justify-center
            transition-all duration-300 z-10
            ${
              state === "listening"
                ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.6),0_0_60px_rgba(239,68,68,0.3)]"
                : state === "processing"
                ? "bg-indigo-600 shadow-[0_0_20px_rgba(99,102,241,0.4)]"
                : state === "done"
                ? "bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
                : "bg-white/5 border border-white/10 hover:bg-white/10 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]"
            }
            ${!supported ? "opacity-40 cursor-not-allowed" : ""}
          `}
        >
          {/* Pulsing rings when listening */}
          <AnimatePresence>
            {state === "listening" && (
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

          {state === "processing" ? (
            <Loader2 className={`${iconSize} text-white animate-spin`} />
          ) : state === "listening" ? (
            <MicOff className={`${iconSize} text-white`} />
          ) : state === "done" ? (
            <RefreshCw className={`${iconSize} text-white`} />
          ) : (
            <Mic className={`${iconSize} text-slate-400`} />
          )}
        </motion.button>
      </div>

      {/* Status label */}
      <div className="flex items-center gap-2">
        {state === "listening" && <WaveformBars />}
        <span className={`text-[11px] font-medium ${
          state === "listening" ? "text-red-400" :
          state === "processing" ? "text-indigo-400" :
          state === "done" ? "text-emerald-400" :
          "text-slate-500"
        }`}>
          {!supported
            ? "Not supported — use Chrome or Edge"
            : state === "listening"
            ? speechDetected ? "Listening... tap to stop" : "Speak now..."
            : state === "processing"
            ? "Analyzing speech..."
            : state === "done"
            ? "Tap to try again"
            : "Tap to speak"}
        </span>
        {state === "listening" && <WaveformBars />}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="w-full flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-400 flex-1">{error}</span>
            <button
              onClick={() => { setError(""); startListening(); }}
              className="text-[10px] text-red-400 hover:text-red-300 underline shrink-0"
            >
              Retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="w-full glass rounded-xl p-3"
          >
            <div className="text-[10px] text-slate-500 font-medium mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              {state === "listening" ? "Hearing:" : "Transcribed:"}
            </div>
            <p className="text-xs text-slate-300 leading-relaxed italic">
              &ldquo;{transcript}&rdquo;
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Extracted Data (after processing) */}
      <AnimatePresence>
        {extracted.length > 0 && state !== "listening" && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="w-full"
          >
            <div className="text-[10px] text-slate-500 font-medium mb-1.5">Extracted from speech:</div>
            <div className="flex flex-wrap gap-1.5">
              {extracted.map((e) => (
                <span
                  key={e.field}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                >
                  {e.field === "Guest" && <User className="w-2.5 h-2.5" />}
                  {e.field === "Party" && <Users className="w-2.5 h-2.5" />}
                  {e.field}:&nbsp;{e.value}
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
