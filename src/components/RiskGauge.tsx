import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  /** 0-100 risk score */
  value: number;
  /** Size in px */
  size?: number;
  label?: string;
}

export default function RiskGauge({ value, size = 200, label }: Props) {
  const [animatedValue, setAnimatedValue] = useState(0);

  useEffect(() => {
    // Animate from 0 to value
    let frame: number;
    const start = performance.now();
    const duration = 1200;
    const from = 0;
    const to = Math.min(100, Math.max(0, value));

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValue(from + (to - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  // Gauge shows 270 degrees (3/4 circle)
  const arcLength = circumference * 0.75;
  const filledLength = (animatedValue / 100) * arcLength;
  const cx = size / 2;
  const cy = size / 2;

  // Color interpolation: green -> amber -> red
  const getColor = (v: number) => {
    if (v < 40) return { main: "#22c55e", glow: "rgba(34,197,94,0.4)", bg: "rgba(34,197,94,0.08)" };
    if (v < 70) return { main: "#f59e0b", glow: "rgba(245,158,11,0.4)", bg: "rgba(245,158,11,0.08)" };
    return { main: "#ef4444", glow: "rgba(239,68,68,0.6)", bg: "rgba(239,68,68,0.12)" };
  };

  const color = getColor(animatedValue);
  const isHighRisk = animatedValue >= 70;

  return (
    <div className="relative flex flex-col items-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", damping: 20, stiffness: 200 }}
        className="relative"
        style={{ width: size, height: size }}
      >
        {/* Outer glow */}
        <div
          className="absolute inset-0 rounded-full transition-all duration-700"
          style={{
            boxShadow: isHighRisk
              ? `0 0 40px ${color.glow}, 0 0 80px ${color.glow}`
              : `0 0 20px ${color.glow}`,
            animation: isHighRisk ? "pulse-glow 2s ease-in-out infinite" : undefined,
          }}
        />

        <svg width={size} height={size} className="transform -rotate-[135deg]">
          <defs>
            <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background track */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Filled arc */}
          <circle
            cx={cx}
            cy={cy}
            r={radius}
            fill="none"
            stroke={color.main}
            strokeWidth={strokeWidth}
            strokeDasharray={`${filledLength} ${circumference}`}
            strokeLinecap="round"
            filter="url(#gauge-glow)"
            className="transition-colors duration-500"
          />

          {/* Tick marks */}
          {[0, 25, 50, 75, 100].map((tick) => {
            const angle = (tick / 100) * 270 * (Math.PI / 180);
            const innerR = radius - strokeWidth;
            const outerR = radius + 2;
            return (
              <line
                key={tick}
                x1={cx + innerR * Math.cos(angle)}
                y1={cy + innerR * Math.sin(angle)}
                x2={cx + outerR * Math.cos(angle)}
                y2={cy + outerR * Math.sin(angle)}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* Center display */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            key={Math.round(animatedValue)}
            className="text-4xl font-black tabular-nums"
            style={{ color: color.main }}
          >
            {Math.round(animatedValue)}
          </motion.span>
          <span className="text-[11px] text-slate-500 font-medium -mt-1">
            Risk Score
          </span>
        </div>
      </motion.div>

      {label && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-2 text-xs font-semibold px-3 py-1 rounded-lg"
          style={{ color: color.main, background: color.bg }}
        >
          {label}
        </motion.div>
      )}

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
