import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Clock, DollarSign, Loader2 } from "lucide-react";
import type { ReservationInput, GuestPrediction } from "../lib/types";
import { predictGuestBehavior } from "../lib/api";

interface Props {
  form: ReservationInput;
  onFormChange: (field: keyof ReservationInput, value: unknown) => void;
  onPrediction: (p: GuestPrediction) => void;
}

const LEAD_TIME_MARKS = [
  { value: 0, label: "Now" },
  { value: 1, label: "1d" },
  { value: 3, label: "3d" },
  { value: 7, label: "1w" },
  { value: 14, label: "2w" },
  { value: 30, label: "1mo" },
];

export default function SimulatorControls({ form, onFormChange, onPrediction }: Props) {
  const [simulating, setSimulating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController>();

  const triggerSimulation = useCallback(
    (updatedForm: ReservationInput) => {
      if (!updatedForm.guest_name.trim()) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();

      debounceRef.current = setTimeout(async () => {
        setSimulating(true);
        abortRef.current = new AbortController();
        try {
          const result = await predictGuestBehavior(updatedForm);
          onPrediction(result);
        } catch {
          // Silently ignore aborted requests
        } finally {
          setSimulating(false);
        }
      }, 600);
    },
    [onPrediction]
  );

  const handleLeadTime = (val: number) => {
    onFormChange("booking_advance_days", val);
    triggerSimulation({ ...form, booking_advance_days: val });
  };

  const handleSpend = (val: number) => {
    onFormChange("estimated_spend_per_cover", val);
    triggerSimulation({ ...form, estimated_spend_per_cover: val });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-5 space-y-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="text-lg">&#x23F1;</span>
          Time-Travel Simulator
        </h3>
        {simulating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-1 text-[10px] text-indigo-400"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Recalculating...
          </motion.div>
        )}
      </div>

      {/* Lead Time Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Booking Advance
          </label>
          <span className="text-xs font-bold text-white tabular-nums">
            {form.booking_advance_days === 0
              ? "Walk-in"
              : form.booking_advance_days === 1
              ? "1 day"
              : `${form.booking_advance_days} days`}
          </span>
        </div>

        <div className="relative">
          <input
            type="range"
            min={0}
            max={30}
            step={1}
            value={form.booking_advance_days}
            onChange={(e) => handleLeadTime(Number(e.target.value))}
            className="slider-cyber w-full"
          />
          {/* Tick labels */}
          <div className="flex justify-between mt-1 px-0.5">
            {LEAD_TIME_MARKS.map((m) => (
              <span
                key={m.value}
                className={`text-[9px] font-medium ${
                  form.booking_advance_days >= m.value
                    ? "text-indigo-400"
                    : "text-slate-600"
                }`}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Spend Slider */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            Spend per Cover
          </label>
          <span className="text-xs font-bold text-emerald-400 tabular-nums">
            ${form.estimated_spend_per_cover}
          </span>
        </div>

        <div className="relative">
          <input
            type="range"
            min={20}
            max={300}
            step={5}
            value={form.estimated_spend_per_cover}
            onChange={(e) => handleSpend(Number(e.target.value))}
            className="slider-cyber w-full"
          />
          <div className="flex justify-between mt-1 px-0.5">
            {["$20", "$80", "$150", "$220", "$300"].map((l) => (
              <span key={l} className="text-[9px] font-medium text-slate-600">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[10px] text-slate-600 text-center italic">
        Drag sliders to see risk change in real-time
      </p>
    </motion.div>
  );
}
