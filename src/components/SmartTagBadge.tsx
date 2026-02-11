import type { TagResult, Sentiment, SmartTag } from "../lib/types";

const TAG_COLOR: Record<string, string> = {
  gold: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  blue: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  red: "bg-red-500/15 text-red-400 border-red-500/30",
  green: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  gray: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  purple: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export function SmartTagBadge({ tag, color }: TagResult) {
  const c = TAG_COLOR[color] || TAG_COLOR.gray;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${c}`}>
      {tag}
    </span>
  );
}

const CATEGORY_ICON: Record<string, string> = {
  Dietary: "\u{1F96C}",
  Occasion: "\u{1F389}",
  Seating: "\u{1FA91}",
  Status: "\u{2B50}",
  Accessibility: "\u{267F}",
  Family: "\u{1F476}",
};

export function NoteSmartTag({ tag }: { tag: SmartTag }) {
  const c = TAG_COLOR[tag.color] || TAG_COLOR.gray;
  const icon = CATEGORY_ICON[tag.category] || "";
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${c}`}>
      {icon && <span className="text-xs">{icon}</span>}
      {tag.label}
    </span>
  );
}

const AI_TAG_STYLES: Record<string, string> = {
  "Low Risk": "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  "High Spend Potential": "bg-amber-500/15 text-amber-400 border-amber-500/40",
  "Likely No-Show": "bg-red-500/15 text-red-400 border-red-500/40",
  "Loyal Regular": "bg-indigo-500/15 text-indigo-400 border-indigo-500/40",
  "Watch List": "bg-orange-500/15 text-orange-400 border-orange-500/40",
};

export function AITagBadge({ tag }: { tag: string }) {
  const style = AI_TAG_STYLES[tag] || AI_TAG_STYLES["Low Risk"];
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${style}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
      {tag}
    </span>
  );
}

export function SpendBadge({ tier }: { tier: string }) {
  const styles: Record<string, string> = {
    Luxury: "bg-violet-500/15 text-violet-400",
    Premium: "bg-indigo-500/15 text-indigo-400",
    Standard: "bg-slate-500/15 text-slate-400",
    Budget: "bg-slate-500/10 text-slate-500",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold ${styles[tier] || styles.Standard}`}>
      {tier}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const bg: Record<string, string> = {
    positive: "bg-emerald-500/10 border-emerald-500/20",
    neutral: "bg-amber-500/10 border-amber-500/20",
    negative: "bg-red-500/10 border-red-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border ${bg[sentiment.label] || bg.neutral}`}>
      <span className="text-sm">{sentiment.emoji}</span>
      <span className="capitalize font-medium text-slate-300">{sentiment.label}</span>
      <span className="text-slate-500">{(sentiment.score * 100).toFixed(0)}%</span>
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] text-slate-500 font-semibold w-8">{pct}%</span>
    </div>
  );
}
