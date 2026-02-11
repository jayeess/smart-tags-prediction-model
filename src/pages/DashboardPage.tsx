import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Brain,
  Users,
  AlertTriangle,
  TrendingUp,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { healthCheck } from "../lib/api";
import GuestCard from "../components/GuestCard";
import type { PredictionResponseUnified } from "../lib/types";
import { fetchGuestPrediction } from "../lib/services/guestService";

interface StatCard {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}

export default function DashboardPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [prediction, setPrediction] = useState<PredictionResponseUnified | null>(null);
  const [leadHours, setLeadHours] = useState<number>(0);
  const [spend, setSpend] = useState<number>(70);
  const [notes, setNotes] = useState<string>("Vegan birthday, window seat preferred");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    healthCheck().then(setHealth).catch(() => {});
  }, []);

  const stats: StatCard[] = [
    {
      label: "AI Model",
      value: health?.model_loaded ? "Loaded" : "Standby",
      icon: <Brain className="w-5 h-5" />,
      color: "text-indigo-600 bg-indigo-50",
    },
    {
      label: "Prediction Engine",
      value: "ANN v1",
      icon: <Sparkles className="w-5 h-5" />,
      color: "text-violet-600 bg-violet-50",
    },
    {
      label: "Accuracy",
      value: "87.7%",
      icon: <TrendingUp className="w-5 h-5" />,
      color: "text-emerald-600 bg-emerald-50",
    },
    {
      label: "Tags Supported",
      value: "12+",
      icon: <Users className="w-5 h-5" />,
      color: "text-amber-600 bg-amber-50",
    },
  ];

  const features = [
    {
      title: "Guest Behavior Prediction",
      desc: "ANN model predicts no-show probability and reliability scores for each reservation.",
      icon: <Brain className="w-6 h-6 text-indigo-500" />,
    },
    {
      title: "Smart Tag Extraction",
      desc: "Auto-detects VIP, allergy, dietary, milestone, and behavioral tags from notes.",
      icon: <Sparkles className="w-6 h-6 text-violet-500" />,
    },
    {
      title: "Sentiment Analysis",
      desc: "NLP layer analyzes reservation notes to gauge guest mood and expectations.",
      icon: <TrendingUp className="w-6 h-6 text-emerald-500" />,
    },
    {
      title: "No-Show Risk Alerts",
      desc: "Flags high-risk reservations so managers can take proactive action.",
      icon: <AlertTriangle className="w-6 h-6 text-red-500" />,
    },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 mt-1">
          AI-powered guest insights and predictive smart tags
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
              {s.icon}
            </div>
            <div>
              <div className="text-sm text-gray-500">{s.label}</div>
              <div className="text-lg font-bold">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Features */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {features.map((f) => (
          <div key={f.title} className="card flex gap-4">
            <div className="mt-1">{f.icon}</div>
            <div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link
          to="/analyze"
          className="card flex items-center justify-between hover:border-indigo-300 transition-colors group"
        >
          <div>
            <h3 className="font-semibold">Analyze a Reservation</h3>
            <p className="text-sm text-gray-500">
              Get AI predictions and smart tags for a guest
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
        </Link>
        <Link
          to="/tables"
          className="card flex items-center justify-between hover:border-indigo-300 transition-colors group"
        >
          <div>
            <h3 className="font-semibold">Table View</h3>
            <p className="text-sm text-gray-500">
              View tonight's reservations with predictions
            </p>
          </div>
          <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" />
        </Link>
      </div>

      {/* Playground */}
      <div className="mt-8">
        <div className="card p-6">
          <h3 className="font-semibold mb-4">Playground</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-gray-600">Lead Time (hours)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={leadHours}
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  setLeadHours(v);
                  setPending(true);
                  const res = await fetchGuestPrediction({
                    lead_time: v,
                    avg_price: spend,
                    special_requests: notes,
                  });
                  setPrediction(res);
                  setPending(false);
                }}
              />
            </div>
            <div>
              <label className="text-sm text-gray-600">Spend ($)</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={spend}
                onChange={async (e) => {
                  const v = Number(e.target.value);
                  setSpend(v);
                  setPending(true);
                  const res = await fetchGuestPrediction({
                    lead_time: leadHours,
                    avg_price: v,
                    special_requests: notes,
                  });
                  setPrediction(res);
                  setPending(false);
                }}
              />
            </div>
            <div className="col-span-3">
              <label className="text-sm text-gray-600">Notes</label>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={3}
                value={notes}
                onChange={async (e) => {
                  const v = e.target.value;
                  setNotes(v);
                  setPending(true);
                  const res = await fetchGuestPrediction({
                    lead_time: leadHours,
                    avg_price: spend,
                    special_requests: v,
                  });
                  setPrediction(res);
                  setPending(false);
                }}
              />
            </div>
          </div>
          {prediction && (
            <div className="mt-6">
              <GuestCard data={prediction} />
            </div>
          )}
          {pending && <div className="mt-3 text-xs text-gray-500">Updating…</div>}
        </div>
      </div>

      {/* API Status */}
      {health && (
        <div className="mt-6 text-xs text-gray-400">
          API: {String(health.status)} | Version: {String(health.version)}
        </div>
      )}
    </div>
  );
}
