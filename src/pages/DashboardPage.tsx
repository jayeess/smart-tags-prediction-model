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
import { useMemo } from "react";
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

      {/* Simulate Guest */}
      <div className="mt-8">
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Simulate Guest</h3>
              <p className="text-sm text-gray-500">Runs a test prediction with vegan birthday notes</p>
            </div>
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={async () => {
                const res = await fetchGuestPrediction({
                  lead_time: 0,
                  avg_price: 70,
                  special_requests: "Vegan birthday, window seat preferred",
                  party_size: 2,
                  children: 0,
                });
                setPrediction(res);
              }}
            >
              Run
            </button>
          </div>
          {prediction && (
            <div className="mt-6">
              <GuestCard data={prediction} />
            </div>
          )}
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
