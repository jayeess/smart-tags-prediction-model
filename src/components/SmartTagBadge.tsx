import type { TagResult, Sentiment } from "../lib/types";

const COLOR_MAP: Record<string, string> = {
  gold: "bg-amber-100 text-amber-800 border-amber-300",
  blue: "bg-blue-100 text-blue-800 border-blue-300",
  red: "bg-red-100 text-red-800 border-red-300",
  gray: "bg-gray-100 text-gray-700 border-gray-300",
  purple: "bg-purple-100 text-purple-800 border-purple-300",
  green: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

export function SmartTagBadge({ tag, color }: TagResult) {
  const colorClass = COLOR_MAP[color] || COLOR_MAP.gray;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}
    >
      {tag}
    </span>
  );
}

const AI_TAG_STYLES: Record<string, string> = {
  "Low Risk": "bg-emerald-100 text-emerald-800 border-emerald-400",
  "High Spend Potential": "bg-amber-100 text-amber-800 border-amber-400",
  "Likely No-Show": "bg-red-100 text-red-800 border-red-400",
  "Loyal Regular": "bg-indigo-100 text-indigo-800 border-indigo-400",
};

export function AITagBadge({ tag }: { tag: string }) {
  const style = AI_TAG_STYLES[tag] || AI_TAG_STYLES["Low Risk"];
  return (
    <span
      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold border ${style}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {tag}
    </span>
  );
}

export function SpendBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Luxury: "bg-violet-100 text-violet-800",
    Premium: "bg-indigo-100 text-indigo-800",
    Standard: "bg-slate-100 text-slate-700",
    Budget: "bg-gray-100 text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        styles[tier] || styles.Standard
      }`}
    >
      {tier}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const bgMap: Record<string, string> = {
    positive: "bg-emerald-50 border-emerald-200",
    neutral: "bg-yellow-50 border-yellow-200",
    negative: "bg-red-50 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border ${
        bgMap[sentiment.label] || bgMap.neutral
      }`}
    >
      <span className="text-base">{sentiment.emoji}</span>
      <span className="capitalize font-medium">{sentiment.label}</span>
      <span className="text-gray-400 ml-1">{(sentiment.score * 100).toFixed(0)}%</span>
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 font-medium w-8">{pct}%</span>
    </div>
  );
}
