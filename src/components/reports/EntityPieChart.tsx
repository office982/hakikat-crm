"use client";

import { Card } from "@/components/ui/Card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";

const data = [
  { name: "חקיקת נכסים", value: 112000, color: "#1F4E79" },
  { name: 'שיא הכרמל מדור בע"מ', value: 33000, color: "#2D6EA3" },
  { name: 'נכסי המושבה בע"מ', value: 13000, color: "#5B9BD5" },
];

export function EntityPieChart() {
  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">חלוקה לפי ישות</h3>
      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              dataKey="value"
              label={({ name, percent }) => `${String(name ?? "").split(" ")[0]} ${((percent ?? 0) * 100).toFixed(0)}%`}
              labelLine={false}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
              <span>{d.name}</span>
            </div>
            <span className="font-medium" dir="ltr">{formatCurrency(d.value)}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
