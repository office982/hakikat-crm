"use client";

import { Card } from "@/components/ui/Card";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";

interface RevenueChartProps {
  data: { month: string; expected: number; actual: number }[];
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string }>; label?: string }) {
  if (!active || !payload) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm" dir="rtl">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function RevenueChart({ data }: RevenueChartProps) {
  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">הכנסות — 12 חודשים אחרונים</h3>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              formatter={(value) => (value === "expected" ? "צפוי" : "בפועל")}
            />
            <Line
              type="monotone"
              dataKey="expected"
              stroke="#22C55E"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="expected"
            />
            <Line
              type="monotone"
              dataKey="actual"
              stroke="#1F4E79"
              strokeWidth={2}
              dot={{ r: 4 }}
              name="actual"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
