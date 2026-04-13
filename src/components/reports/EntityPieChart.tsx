"use client";

import { Card } from "@/components/ui/Card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { EntityBreakdown } from "@/hooks/useReports";

const COLORS = ["#1F4E79", "#2D6EA3", "#5B9BD5", "#8CB4D9", "#B4D0E8", "#D6E6F2"];

interface EntityPieChartProps {
  data: EntityBreakdown[];
  isLoading?: boolean;
}

export function EntityPieChart({ data, isLoading }: EntityPieChartProps) {
  const coloredData = data.map((d, i) => ({
    ...d,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">חלוקה לפי ישות</h3>
      {isLoading ? (
        <div className="flex items-center justify-center h-[250px] text-muted">טוען נתונים...</div>
      ) : coloredData.length === 0 ? (
        <div className="flex items-center justify-center h-[250px] text-muted">אין נתונים להצגה</div>
      ) : (
        <>
          <div style={{ width: "100%", height: 250 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={coloredData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${String(name ?? "").split(" ")[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {coloredData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-2">
            {coloredData.map((d) => (
              <div key={d.entityId} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span>{d.name}</span>
                </div>
                <span className="font-medium" dir="ltr">{formatCurrency(d.value)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
