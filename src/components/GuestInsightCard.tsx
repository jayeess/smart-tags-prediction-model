import type { GuestPrediction } from "../lib/types";
import {
  AITagBadge,
  SpendBadge,
  SentimentBadge,
  ConfidenceMeter,
} from "./SmartTagBadge";
import {
  User,
  TrendingUp,
  AlertTriangle,
  Shield,
  Clock,
} from "lucide-react";

interface GuestInsightCardProps {
  prediction: GuestPrediction;
  compact?: boolean;
}

export default function GuestInsightCard({
  prediction,
  compact = false,
}: GuestInsightCardProps) {
  const riskColor =
    prediction.risk_label === "High Risk"
      ? "border-l-red-500"
      : prediction.risk_label === "Medium Risk"
      ? "border-l-amber-500"
      : "border-l-emerald-500";

  if (compact) {
    return (
      <div
        className={`bg-white rounded-lg border border-gray-100 border-l-4 ${riskColor} p-3 animate-slide-up`}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" />
            <span className="font-medium text-sm">{prediction.guest_name}</span>
          </div>
          <AITagBadge tag={prediction.ai_tag} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SpendBadge tier={prediction.spend_tag} />
          <SentimentBadge sentiment={prediction.sentiment} />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card border-l-4 ${riskColor} animate-slide-up`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-gray-400" />
            {prediction.guest_name}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Tenant: {prediction.tenant_id}
          </p>
        </div>
        <AITagBadge tag={prediction.ai_tag} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            <Shield className="w-3.5 h-3.5" />
            Reliability Score
          </div>
          <div className="text-2xl font-bold">
            {(prediction.reliability_score * 100).toFixed(1)}%
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            No-Show Risk
          </div>
          <div
            className={`text-2xl font-bold ${
              prediction.no_show_risk >= 0.6
                ? "text-red-600"
                : prediction.no_show_risk >= 0.35
                ? "text-amber-600"
                : "text-emerald-600"
            }`}
          >
            {(prediction.no_show_risk * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Tags Row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <SpendBadge tier={prediction.spend_tag} />
        <SentimentBadge sentiment={prediction.sentiment} />
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
          {prediction.risk_label}
        </span>
      </div>

      {/* Confidence */}
      <div>
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
          <TrendingUp className="w-3 h-3" />
          Model Confidence
        </div>
        <ConfidenceMeter value={prediction.confidence} />
      </div>

      {/* Timestamp */}
      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-1 text-xs text-gray-400">
        <Clock className="w-3 h-3" />
        {new Date(prediction.predicted_at).toLocaleString()}
      </div>
    </div>
  );
}
