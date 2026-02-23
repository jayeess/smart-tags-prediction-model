import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, PieChart as PieIcon, BarChart3 } from "lucide-react";
import type { AnalysisRecord } from "../lib/historyStore";

/* ── Risk Distribution Donut ──────────────────────────── */

const RISK_COLORS = {
  "High Risk": "#ef4444",
  "Medium Risk": "#f59e0b",
  "Low Risk": "#22c55e",
};

interface RiskDonutProps {
  records: AnalysisRecord[];
}

export function RiskDonutChart({ records }: RiskDonutProps) {
  const data = useMemo(() => {
    const counts = { "High Risk": 0, "Medium Risk": 0, "Low Risk": 0 };
    records.forEach((r) => {
      const label = r.prediction.risk_label;
      if (label in counts) counts[label as keyof typeof counts]++;
    });
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => d.value > 0);
  }, [records]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <PieIcon className="w-8 h-8 mb-2" />
        <p className="text-xs">No data yet</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col items-center">
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={75}
            paddingAngle={3}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={RISK_COLORS[entry.name as keyof typeof RISK_COLORS] || "#64748b"}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "rgba(15,23,42,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px",
              fontSize: "11px",
              color: "#e2e8f0",
            }}
            formatter={(value) => {
              const v = Number(value) || 0;
              return `${v} (${((v / total) * 100).toFixed(0)}%)`;
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-3 mt-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: RISK_COLORS[d.name as keyof typeof RISK_COLORS] }}
            />
            <span className="text-[10px] text-slate-500">{d.name.replace(" Risk", "")}</span>
            <span className="text-[10px] text-slate-400 font-semibold">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Analysis Trend (Last 7 Days) ─────────────────────── */

interface TrendChartProps {
  records: AnalysisRecord[];
}

export function AnalysisTrendChart({ records }: TrendChartProps) {
  const data = useMemo(() => {
    const days: { date: string; count: number; highRisk: number }[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString("en-US", { weekday: "short" });

      const dayRecords = records.filter(
        (r) => r.timestamp.slice(0, 10) === dateStr
      );
      days.push({
        date: label,
        count: dayRecords.length,
        highRisk: dayRecords.filter((r) => r.prediction.risk_label === "High Risk").length,
      });
    }
    return days;
  }, [records]);

  const hasData = data.some((d) => d.count > 0);

  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <TrendingUp className="w-8 h-8 mb-2" />
        <p className="text-xs">No trend data yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="analysisFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            fontSize: "11px",
            color: "#e2e8f0",
          }}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#6366f1"
          strokeWidth={2}
          fill="url(#analysisFill)"
          name="Analyses"
        />
        <Area
          type="monotone"
          dataKey="highRisk"
          stroke="#ef4444"
          strokeWidth={2}
          fill="url(#riskFill)"
          name="High Risk"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ── Channel Distribution Bar Chart ──────────────────── */

interface ChannelChartProps {
  records: AnalysisRecord[];
}

const CHANNEL_COLORS: Record<string, string> = {
  Online: "#6366f1",
  Phone: "#8b5cf6",
  "Walk-in": "#06b6d4",
  "Third-party": "#f59e0b",
};

export function ChannelBarChart({ records }: ChannelChartProps) {
  const data = useMemo(() => {
    const channels: Record<string, number> = {};
    records.forEach((r) => {
      const ch = r.input?.booking_channel || "Unknown";
      channels[ch] = (channels[ch] || 0) + 1;
    });
    return Object.entries(channels)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [records]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600">
        <BarChart3 className="w-8 h-8 mb-2" />
        <p className="text-xs">No channel data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "rgba(15,23,42,0.95)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px",
            fontSize: "11px",
            color: "#e2e8f0",
          }}
        />
        <Bar dataKey="value" name="Bookings" radius={[6, 6, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={CHANNEL_COLORS[entry.name] || "#64748b"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ── Combined Analytics Panel ─────────────────────────── */

interface AnalyticsPanelProps {
  records: AnalysisRecord[];
}

export default function AnalyticsPanel({ records }: AnalyticsPanelProps) {
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <>
      {/* Row: Risk Donut + Trend Chart */}
      <motion.div variants={item} className="md:col-span-5 glass p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <PieIcon className="w-4 h-4 text-indigo-400" />
          Risk Distribution
        </h3>
        <RiskDonutChart records={records} />
      </motion.div>

      <motion.div variants={item} className="md:col-span-7 glass p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-indigo-400" />
          Analysis Trend
          <span className="text-[10px] font-normal text-slate-500 ml-auto">Last 7 days</span>
        </h3>
        <AnalysisTrendChart records={records} />
      </motion.div>

      {/* Channel Bar */}
      <motion.div variants={item} className="md:col-span-12 glass p-5">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          Booking Channels
          <span className="text-[10px] font-normal text-slate-500 ml-auto">
            {records.length} total
          </span>
        </h3>
        <ChannelBarChart records={records} />
      </motion.div>
    </>
  );
}
