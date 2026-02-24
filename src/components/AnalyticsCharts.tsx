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
  Legend,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp, PieChart as PieIcon, BarChart3 } from "lucide-react";
import type { AnalysisRecord } from "../lib/historyStore";

/* ── Shared tooltip style (high contrast, solid background) ── */
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#1e293b",
  border: "1px solid rgba(148,163,184,0.3)",
  borderRadius: "12px",
  fontSize: "13px",
  color: "#f1f5f9",
  padding: "10px 14px",
  boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
};

const LEGEND_STYLE: React.CSSProperties = {
  fontSize: "12px",
  color: "#cbd5e1",
  fontWeight: 600,
};

/* ── Risk Distribution Donut ──────────────────────────── */

const RISK_COLORS = {
  "High Risk": "#f87171",
  "Medium Risk": "#fbbf24",
  "Low Risk": "#4ade80",
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
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <PieIcon className="w-8 h-8 mb-2" />
        <p className="text-sm">No data yet</p>
      </div>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderLabel = (props: any) => {
    const { cx, cy, midAngle, innerRadius, outerRadius, value } = props;
    if (!cx || !cy || midAngle == null) return null;
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    const pct = ((value / total) * 100).toFixed(0);
    if (Number(pct) < 8) return null;
    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="13"
        fontWeight="bold"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
      >
        {pct}%
      </text>
    );
  };

  return (
    <div className="flex flex-col items-center relative">
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={88}
            paddingAngle={4}
            dataKey="value"
            strokeWidth={2}
            stroke="rgba(15,23,42,0.8)"
            label={renderLabel}
            labelLine={false}
          >
            {data.map((entry) => (
              <Cell
                key={entry.name}
                fill={RISK_COLORS[entry.name as keyof typeof RISK_COLORS] || "#64748b"}
                style={{
                  filter: `drop-shadow(0 0 8px ${RISK_COLORS[entry.name as keyof typeof RISK_COLORS] || "#64748b"}60)`,
                }}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(value) => {
              const v = Number(value) || 0;
              return [`${v} guests (${((v / total) * 100).toFixed(0)}%)`, "Count"];
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Center total overlay */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[calc(50%+12px)] text-center pointer-events-none">
        <div className="text-2xl font-black text-white">{total}</div>
        <div className="text-[10px] text-slate-400 font-semibold tracking-wide">TOTAL</div>
      </div>

      {/* Legend below chart */}
      <div className="flex items-center gap-5 mt-1">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full"
              style={{
                background: RISK_COLORS[d.name as keyof typeof RISK_COLORS],
                boxShadow: `0 0 10px ${RISK_COLORS[d.name as keyof typeof RISK_COLORS]}80`,
              }}
            />
            <span className="text-xs text-slate-300 font-medium">
              {d.name.replace(" Risk", "")}
            </span>
            <span className="text-xs text-white font-bold">{d.value}</span>
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
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <TrendingUp className="w-8 h-8 mb-2" />
        <p className="text-sm">No trend data yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={210}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <defs>
          <linearGradient id="analysisFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#818cf8" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="riskFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f87171" stopOpacity={0.35} />
            <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.06)"
          vertical={false}
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: "#94a3b8", fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#94a3b8", fontWeight: 500 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend
          wrapperStyle={LEGEND_STYLE}
          iconType="circle"
          iconSize={10}
        />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#818cf8"
          strokeWidth={3}
          fill="url(#analysisFill)"
          name="All Analyses"
          dot={{ fill: "#818cf8", strokeWidth: 2, r: 5, stroke: "#1e293b" }}
          activeDot={{ r: 7, fill: "#818cf8", stroke: "#fff", strokeWidth: 2 }}
        />
        <Area
          type="monotone"
          dataKey="highRisk"
          stroke="#f87171"
          strokeWidth={3}
          fill="url(#riskFill)"
          name="High Risk"
          dot={{ fill: "#f87171", strokeWidth: 2, r: 5, stroke: "#1e293b" }}
          activeDot={{ r: 7, fill: "#f87171", stroke: "#fff", strokeWidth: 2 }}
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
  Online: "#818cf8",
  Phone: "#a78bfa",
  "Walk-in": "#22d3ee",
  "Third-party": "#fbbf24",
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
      <div className="flex flex-col items-center justify-center h-full text-slate-500">
        <BarChart3 className="w-8 h-8 mb-2" />
        <p className="text-sm">No channel data</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.06)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12, fill: "#94a3b8", fontWeight: 500 }}
          tickLine={false}
          axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: "#94a3b8", fontWeight: 500 }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Bar dataKey="value" name="Bookings" radius={[8, 8, 0, 0]} barSize={44}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={CHANNEL_COLORS[entry.name] || "#64748b"}
              style={{
                filter: `drop-shadow(0 4px 12px ${CHANNEL_COLORS[entry.name] || "#64748b"}50)`,
              }}
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

  const avgRisk = useMemo(() => {
    if (records.length === 0) return 0;
    const sum = records.reduce((acc, r) => {
      const score = r.prediction.ai_prediction?.risk_score ?? Math.round(r.prediction.no_show_risk * 100);
      return acc + score;
    }, 0);
    return Math.round(sum / records.length);
  }, [records]);

  return (
    <>
      {/* Risk Donut */}
      <motion.div variants={item} className="md:col-span-5 glass p-6">
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <PieIcon className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          Risk Distribution
        </h3>
        <p className="text-[11px] text-slate-400 mb-3 ml-9">
          Across all <span className="text-white font-semibold">{records.length}</span> analyses
        </p>
        <RiskDonutChart records={records} />
      </motion.div>

      {/* Trend Chart */}
      <motion.div variants={item} className="md:col-span-7 glass p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            Analysis Trend
          </h3>
          <span className="text-xs font-semibold text-slate-300 bg-white/5 px-3 py-1 rounded-lg border border-white/10">
            Last 7 days
          </span>
        </div>
        <p className="text-[11px] text-slate-400 mb-3 ml-9">
          Avg risk: <span className={`font-bold ${avgRisk >= 70 ? "text-red-400" : avgRisk >= 40 ? "text-amber-400" : "text-emerald-400"}`}>{avgRisk}%</span>
        </p>
        <AnalysisTrendChart records={records} />
      </motion.div>

      {/* Channel Bar */}
      <motion.div variants={item} className="md:col-span-12 glass p-6">
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          Booking Channels
          <span className="text-xs font-semibold text-slate-300 bg-white/5 px-3 py-1 rounded-lg border border-white/10 ml-auto">
            {records.length} analyses
          </span>
        </h3>
        <p className="text-[11px] text-slate-400 mb-3 ml-9">How guests are booking reservations</p>
        <ChannelBarChart records={records} />
      </motion.div>
    </>
  );
}
