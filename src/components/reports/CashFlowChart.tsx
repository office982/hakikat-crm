"use client";

import { Card } from "@/components/ui/Card";
import {
  ResponsiveContainer, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, Area, ComposedChart,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface CashFlowChartProps {
  data: { month: string; expected: number; actual: number }[];
  isLoading?: boolean;
}

export function CashFlowChart({ data, isLoading }: CashFlowChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    gap: d.expected - d.actual,
  }));

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">תזרים — 12 חודשים אחרונים</h3>
      {isLoading ? (
        <div className="flex items-center justify-center h-[320px] text-muted">טוען נתונים...</div>
      ) : chartData.length === 0 ? (
        <div className="flex items-center justify-center h-[320px] text-muted">אין נתונים להצגה</div>
      ) : (
        <div style={{ width: "100%", height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  name === "expected" ? "צפוי" : name === "actual" ? "בפועל" : "הפרש",
                ]}
              />
              <Legend formatter={(v) => (v === "expected" ? "צפוי" : v === "actual" ? "בפועל" : "הפרש")} />
              <Area type="monotone" dataKey="gap" fill="#FEE2E2" stroke="transparent" name="gap" />
              <Line type="monotone" dataKey="expected" stroke="#22C55E" strokeWidth={2} dot={{ r: 3 }} name="expected" />
              <Line type="monotone" dataKey="actual" stroke="#1F4E79" strokeWidth={2} dot={{ r: 3 }} name="actual" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
