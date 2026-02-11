import { motion } from "framer-motion";
import type { AnalyzeTagsResponse } from "../lib/types";
import { SmartTagBadge, SentimentBadge, ConfidenceMeter } from "./SmartTagBadge";
import { Tag } from "lucide-react";

export default function ResultCard({ result }: { result: AnalyzeTagsResponse }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-lg text-white">{result.customer_name || "Guest"}</h3>
        <span className="text-[11px] bg-white/5 text-slate-500 px-2.5 py-1 rounded-lg font-medium">
          {result.engine}
        </span>
      </div>

      <div className="mb-4">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-2">
          <Tag className="w-3 h-3" />
          Smart Tags
        </div>
        <div className="flex flex-wrap gap-2">
          {result.tags.length > 0 ? (
            result.tags.map((tag, i) => <SmartTagBadge key={i} {...tag} />)
          ) : (
            <span className="text-sm text-slate-600">No tags detected</span>
          )}
        </div>
      </div>

      <div className="mb-4">
        <SentimentBadge sentiment={result.sentiment} />
      </div>

      <div>
        <div className="text-[11px] text-slate-500 font-medium mb-1.5">Confidence</div>
        <ConfidenceMeter value={result.confidence} />
      </div>
    </motion.div>
  );
}
