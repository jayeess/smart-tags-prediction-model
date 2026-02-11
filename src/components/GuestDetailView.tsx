import { motion, AnimatePresence } from "framer-motion";
import { Drawer } from "vaul";
import { useEffect, useState } from "react";
import type { GuestPrediction } from "../lib/types";
import {
  AITagBadge,
  SpendBadge,
  SentimentBadge,
  ConfidenceMeter,
} from "./SmartTagBadge";
import {
  X,
  User,
  Shield,
  AlertTriangle,
  TrendingUp,
  Clock,
  ChevronDown,
} from "lucide-react";

interface Props {
  prediction: GuestPrediction | null;
  open: boolean;
  onClose: () => void;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const check = () => setMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return mobile;
}

function DetailContent({ prediction }: { prediction: GuestPrediction }) {
  const isHighRisk = prediction.no_show_risk >= 0.6;
  const isMedRisk = prediction.no_show_risk >= 0.35;
  const riskColor = isHighRisk
    ? "text-red-400"
    : isMedRisk
    ? "text-amber-400"
    : "text-emerald-400";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center">
          <User className="w-6 h-6 text-slate-400" />
        </div>
        <div>
          <h3 className="font-bold text-xl text-white">{prediction.guest_name}</h3>
          <p className="text-xs text-slate-500">Tenant: {prediction.tenant_id}</p>
        </div>
      </div>

      {/* AI Tag */}
      <div className="flex items-center gap-2">
        <AITagBadge tag={prediction.ai_tag} />
        <SpendBadge tier={prediction.spend_tag} />
      </div>

      {/* Score Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1">
            <Shield className="w-3.5 h-3.5" />
            Reliability
          </div>
          <div className="text-3xl font-extrabold text-white">
            {(prediction.reliability_score * 100).toFixed(1)}
            <span className="text-sm text-slate-500 ml-0.5">%</span>
          </div>
        </div>

        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1">
            <AlertTriangle className="w-3.5 h-3.5" />
            No-Show Risk
          </div>
          <div className={`text-3xl font-extrabold ${riskColor}`}>
            {(prediction.no_show_risk * 100).toFixed(1)}
            <span className="text-sm opacity-60 ml-0.5">%</span>
          </div>
        </div>
      </div>

      {/* Tags Row */}
      <div className="flex items-center gap-2 flex-wrap">
        <SentimentBadge sentiment={prediction.sentiment} />
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white/5 ${riskColor}`}
        >
          {prediction.risk_label}
        </span>
      </div>

      {/* Confidence */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-1.5">
          <TrendingUp className="w-3 h-3" />
          Model Confidence
        </div>
        <ConfidenceMeter value={prediction.confidence} />
      </div>

      {/* Timestamp */}
      <div className="pt-3 border-t border-white/5 flex items-center gap-1 text-[11px] text-slate-600">
        <Clock className="w-3 h-3" />
        {new Date(prediction.predicted_at).toLocaleString()}
      </div>
    </div>
  );
}

// Desktop Modal
function DesktopModal({
  prediction,
  open,
  onClose,
}: {
  prediction: GuestPrediction;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={onClose}
          >
            <div
              className="glass p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-end mb-2">
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <DetailContent prediction={prediction} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Mobile Drawer (vaul)
function MobileDrawer({
  prediction,
  open,
  onClose,
}: {
  prediction: GuestPrediction;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 outline-none">
          <div className="bg-slate-900 border-t border-white/10 rounded-t-3xl px-6 pt-3 pb-8 max-h-[85dvh] overflow-auto">
            <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
            <DetailContent prediction={prediction} />
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export default function GuestDetailView({ prediction, open, onClose }: Props) {
  const isMobile = useIsMobile();

  if (!prediction) return null;

  if (isMobile) {
    return (
      <MobileDrawer prediction={prediction} open={open} onClose={onClose} />
    );
  }

  return (
    <DesktopModal prediction={prediction} open={open} onClose={onClose} />
  );
}
