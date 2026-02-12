import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Loader2, AlertCircle } from "lucide-react";
import type { ReservationInput, GuestPrediction } from "../lib/types";
import { predictGuestBehavior } from "../lib/api";

// Extend Window for vendor-prefixed SpeechRecognition
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
}

function getSpeechRecognition(): SpeechRecognitionType | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as SpeechRecognitionType | null;
}

interface Props {
  onTranscription: (form: Partial<ReservationInput>) => void;
  onPrediction: (p: GuestPrediction) => void;
}

export default function VoiceCommand({ onTranscription, onPrediction }: Props) {
  const [listening, setListening] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const supported = !!getSpeechRecognition();

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const startListening = useCallback(async () => {
    if (listening || processing) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError("Speech recognition not supported in this browser. Use Chrome or Edge.");
      return;
    }

    setError("");
    setTranscript("");

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    let finalTranscript = "";

    recognition.onstart = () => {
      setListening(true);
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
        setError("No speech detected. Try again.");
      } else if (event.error === "not-allowed") {
        setError("Microphone access denied. Allow mic permissions and try again.");
      } else if (event.error !== "aborted") {
        setError(`Speech error: ${event.error}`);
      }
      setListening(false);
      setProcessing(false);
      recognitionRef.current = null;
    };

    recognition.onend = async () => {
      setListening(false);
      recognitionRef.current = null;

      const spokenText = finalTranscript.trim();
      if (!spokenText) {
        setProcessing(false);
        return;
      }

      setProcessing(true);

      // Use transcript as notes and trigger prediction
      const formUpdate: Partial<ReservationInput> = {
        guest_name: "Voice Guest",
        notes: spokenText,
      };
      onTranscription(formUpdate);

      try {
        const fullForm: ReservationInput = {
          guest_name: "Voice Guest",
          party_size: 2,
          children: 0,
          booking_advance_days: 1,
          special_needs_count: 0,
          is_repeat_guest: false,
          estimated_spend_per_cover: 80,
          previous_cancellations: 0,
          previous_completions: 0,
          booking_channel: "Phone",
          notes: spokenText,
        };
        const result = await predictGuestBehavior(fullForm);
        onPrediction(result);
      } catch {
        setError("Prediction failed. Check API connection.");
      } finally {
        setProcessing(false);
      }
    };

    try {
      recognition.start();
    } catch {
      setError("Could not start speech recognition.");
      setListening(false);
    }
  }, [listening, processing, onTranscription, onPrediction]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Mic Button */}
      <motion.button
        onClick={listening ? stopListening : startListening}
        disabled={processing || !supported}
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
          ${!supported ? "opacity-40 cursor-not-allowed" : ""}
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
        {!supported
          ? "Not supported in this browser"
          : listening
          ? "Listening... tap to stop"
          : processing
          ? "Processing..."
          : "Tap to speak"}
      </span>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 5, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={{ opacity: 0, y: -5, height: 0 }}
            className="w-full flex items-center gap-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-400">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>

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
              {listening ? "Hearing:" : "Transcribed:"}
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
