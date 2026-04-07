"use client";

import { Card } from "@/components/ui/Card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

const forecastData = [
  { month: "מאי 26", expected: 158000, expiring: 0, risk: false },
  { month: "יוני 26", expected: 158000, expiring: 0, risk: false },
  { month: "יולי 26", expected: 156000, expiring: 1, risk: true },
  { month: "אוג׳ 26", expected: 153000, expiring: 1, risk: true },
  { month: "ספט׳ 26", expected: 149000, expiring: 2, risk: true },
  { month: "אוק׳ 26", expected: 145000, expiring: 1, risk: true },
  { month: "נוב׳ 26", expected: 140000, expiring: 1, risk: true },
  { month: "דצמ׳ 26", expected: 137000, expiring: 1, risk: true },
  { month: "ינו׳ 27", expected: 140000, expiring: 0, risk: false },
  { month: "פבר׳ 27", expected: 142000, expiring: 0, risk: false },
  { month: "מרץ 27", expected: 145000, expiring: 0, risk: false },
  { month: "אפר׳ 27", expected: 148000, expiring: 0, risk: false },
];

const aiInsight = `בחודשים ספטמבר-דצמבר 2026 צפויה ירידה בהכנסות בגלל 6 חוזים שפוקעים. מומלץ להתחיל חידוש חוזים כבר במאי-יוני 2026 כדי למנוע פער הכנסות.`;

export function ForecastChart() {
  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">תחזית — 12 חודשים קדימה</h3>
      <div style={{ width: "100%", height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={forecastData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip
              formatter={(value) => [formatCurrency(Number(value)), "הכנסה צפויה"]}
              labelFormatter={(label) => {
                const item = forecastData.find((d) => d.month === label);
                return item?.expiring ? `${label} — ${item.expiring} חוזים פוקעים ⚠️` : label;
              }}
            />
            <ReferenceLine y={158000} stroke="#22C55E" strokeDasharray="5 5" label="הכנסה נוכחית" />
            <Bar dataKey="expected" radius={[4, 4, 0, 0]}>
              {forecastData.map((entry, i) => (
                <Cell key={i} fill={entry.risk ? "#F59E0B" : "#1F4E79"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* AI Insight */}
      <div className="mt-4 bg-accent rounded-lg p-4 text-sm">
        <p className="font-medium text-primary mb-1">תובנת AI</p>
        <p className="text-gray-700">{aiInsight}</p>
      </div>
    </Card>
  );
}
