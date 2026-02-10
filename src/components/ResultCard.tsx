import type { AnalyzeTagsResponse } from "../lib/types";
import { SmartTagBadge, SentimentBadge, ConfidenceMeter } from "./SmartTagBadge";
import { Tag } from "lucide-react";

interface ResultCardProps {
  result: AnalyzeTagsResponse;
}

export default function ResultCard({ result }: ResultCardProps) {
  return (
    <div className="card animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">{result.customer_name || "Guest"}</h3>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full">
          Engine: {result.engine}
        </span>
      </div>

      {/* Tags */}
      <div className="mb-4">
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <Tag className="w-3 h-3" />
          Smart Tags
        </div>
        <div className="flex flex-wrap gap-2">
          {result.tags.length > 0 ? (
            result.tags.map((tag, i) => <SmartTagBadge key={i} {...tag} />)
          ) : (
            <span className="text-sm text-gray-400">No tags detected</span>
          )}
        </div>
      </div>

      {/* Sentiment */}
      <div className="mb-4">
        <SentimentBadge sentiment={result.sentiment} />
      </div>

      {/* Confidence */}
      <div>
        <div className="text-xs text-gray-500 mb-1">Confidence</div>
        <ConfidenceMeter value={result.confidence} />
      </div>
    </div>
  );
}
