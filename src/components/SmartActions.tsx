import { motion } from "framer-motion";
import type { GuestPrediction } from "../lib/types";
import {
  ShieldAlert,
  Cake,
  Armchair,
  Star,
  UtensilsCrossed,
  AlertTriangle,
  Baby,
  Leaf,
} from "lucide-react";

interface ActionButton {
  label: string;
  icon: React.ReactNode;
  gradient: string;
  glow: string;
}

function deriveActions(prediction: GuestPrediction): ActionButton[] {
  const actions: ActionButton[] = [];
  const riskLabel = prediction.risk_label;
  const tags = prediction.smart_tags || [];
  const categories = new Set(tags.map((t) => t.category));
  const labels = new Set(tags.map((t) => t.label.toLowerCase()));

  // High Risk -> Request Deposit
  if (riskLabel === "High Risk") {
    actions.push({
      label: "Request Deposit ($50)",
      icon: <ShieldAlert className="w-4 h-4" />,
      gradient: "from-red-600 to-rose-500",
      glow: "shadow-red-500/30",
    });
  }

  // Birthday / Anniversary / Occasion
  if (categories.has("Occasion")) {
    const hasBirthday = labels.has("birthday");
    actions.push({
      label: hasBirthday ? "Alert Pastry Chef" : "Prep Special Setup",
      icon: <Cake className="w-4 h-4" />,
      gradient: "from-purple-600 to-violet-500",
      glow: "shadow-purple-500/30",
    });
  }

  // Seating preference
  if (categories.has("Seating")) {
    const seatingTag = tags.find((t) => t.category === "Seating");
    const seat = seatingTag ? seatingTag.label : "Preferred Seat";
    actions.push({
      label: `Assign ${seat}`,
      icon: <Armchair className="w-4 h-4" />,
      gradient: "from-blue-600 to-cyan-500",
      glow: "shadow-blue-500/30",
    });
  }

  // Dietary / Allergy
  if (categories.has("Dietary")) {
    const hasAllergy = labels.has("allergy alert") || labels.has("nut allergy");
    actions.push({
      label: hasAllergy ? "Alert Kitchen: Allergy" : "Send Dietary Card",
      icon: hasAllergy ? <AlertTriangle className="w-4 h-4" /> : <Leaf className="w-4 h-4" />,
      gradient: hasAllergy ? "from-orange-600 to-amber-500" : "from-emerald-600 to-green-500",
      glow: hasAllergy ? "shadow-orange-500/30" : "shadow-emerald-500/30",
    });
  }

  // VIP
  if (categories.has("Status")) {
    actions.push({
      label: "VIP Protocol",
      icon: <Star className="w-4 h-4" />,
      gradient: "from-amber-600 to-yellow-500",
      glow: "shadow-amber-500/30",
    });
  }

  // Family
  if (categories.has("Family")) {
    actions.push({
      label: "Prep High Chair",
      icon: <Baby className="w-4 h-4" />,
      gradient: "from-pink-600 to-rose-400",
      glow: "shadow-pink-500/30",
    });
  }

  // Fallback if no actions
  if (actions.length === 0) {
    actions.push({
      label: "Standard Service",
      icon: <UtensilsCrossed className="w-4 h-4" />,
      gradient: "from-slate-600 to-slate-500",
      glow: "shadow-slate-500/20",
    });
  }

  return actions;
}

interface Props {
  prediction: GuestPrediction;
}

export default function SmartActions({ prediction }: Props) {
  const actions = deriveActions(prediction);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    show: { opacity: 1, y: 0, scale: 1 },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-2"
    >
      <div className="text-[11px] font-medium text-slate-500 mb-2 flex items-center gap-1">
        <span className="text-sm">&#x26A1;</span>
        Recommended Actions
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <motion.button
            key={action.label}
            variants={item}
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            className={`
              inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
              text-xs font-bold text-white
              bg-gradient-to-r ${action.gradient}
              shadow-lg ${action.glow}
              hover:shadow-xl transition-shadow
              active:shadow-md
            `}
            onClick={() => {
              // In production this would trigger an action
              alert(`Action triggered: ${action.label}`);
            }}
          >
            {action.icon}
            {action.label}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
