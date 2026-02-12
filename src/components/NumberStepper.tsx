import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus } from "lucide-react";

interface StepperProps {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
  icon?: React.ReactNode;
  /** Format the display value */
  format?: (v: number) => string;
  accentColor?: string;
}

export default function NumberStepper({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
  icon,
  format,
  accentColor = "indigo",
}: StepperProps) {
  const clamped = (v: number) => Math.max(min, Math.min(max, v));

  const colorMap: Record<string, { ring: string; bg: string; text: string; glow: string }> = {
    indigo: { ring: "ring-indigo-500/40", bg: "bg-indigo-500/15", text: "text-indigo-400", glow: "shadow-indigo-500/20" },
    emerald: { ring: "ring-emerald-500/40", bg: "bg-emerald-500/15", text: "text-emerald-400", glow: "shadow-emerald-500/20" },
    amber: { ring: "ring-amber-500/40", bg: "bg-amber-500/15", text: "text-amber-400", glow: "shadow-amber-500/20" },
    red: { ring: "ring-red-500/40", bg: "bg-red-500/15", text: "text-red-400", glow: "shadow-red-500/20" },
    violet: { ring: "ring-violet-500/40", bg: "bg-violet-500/15", text: "text-violet-400", glow: "shadow-violet-500/20" },
  };
  const c = colorMap[accentColor] || colorMap.indigo;

  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-2 flex items-center gap-1.5">
        {icon}
        {label}
      </label>

      <div className="flex items-center gap-1.5">
        {/* Minus */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={() => onChange(clamped(value - 1))}
          disabled={value <= min}
          className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center
                     hover:bg-white/[0.08] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <Minus className="w-3.5 h-3.5 text-slate-400" />
        </motion.button>

        {/* Value display */}
        <div className={`flex-1 h-9 rounded-xl ${c.bg} ring-1 ${c.ring} flex items-center justify-center relative overflow-hidden`}>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={value}
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className={`text-sm font-bold ${c.text} tabular-nums`}
            >
              {format ? format(value) : value}
            </motion.span>
          </AnimatePresence>
        </div>

        {/* Plus */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={() => onChange(clamped(value + 1))}
          disabled={value >= max}
          className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center
                     hover:bg-white/[0.08] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5 text-slate-400" />
        </motion.button>
      </div>
    </div>
  );
}

/* ─── Channel Selector ─── */

interface ChannelOption {
  value: string;
  icon: string;
}

const CHANNELS: ChannelOption[] = [
  { value: "Online", icon: "🌐" },
  { value: "Phone", icon: "📞" },
  { value: "Walk-in", icon: "🚶" },
  { value: "App", icon: "📱" },
  { value: "Corporate", icon: "🏢" },
];

interface ChannelSelectorProps {
  value: string;
  onChange: (v: string) => void;
}

export function ChannelSelector({ value, onChange }: ChannelSelectorProps) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-slate-500 mb-2">
        Booking Channel
      </label>
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((ch) => {
          const active = value === ch.value;
          return (
            <motion.button
              key={ch.value}
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => onChange(ch.value)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                active
                  ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/40 shadow-lg shadow-indigo-500/10"
                  : "bg-white/[0.03] text-slate-500 border border-white/[0.06] hover:bg-white/[0.06] hover:text-slate-400"
              }`}
            >
              <span className="text-xs">{ch.icon}</span>
              {ch.value}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
