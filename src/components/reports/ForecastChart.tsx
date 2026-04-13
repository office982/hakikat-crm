"use client";

import { Card } from "@/components/ui/Card";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell, ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils";

interface ForecastChartProps {
  data: { month: string; expected: number; expiringContracts: number; risk: boolean }[];
  currentMonthlyIncome?: number;
  isLoading?: boolean;
}

export function ForecastChart({ data, currentMonthlyIncome, isLoading }: ForecastChartProps) {
  // Generate insight text from data
  const riskMonths = data.filter((d) => d.risk);
  const totalExpiring = riskMonths.reduce((s, d) => s + d.expiringContracts, 0);

  let aiInsight = "";
  if (totalExpiring > 0) {
    const firstRisk = riskMonths[0]?.month || "";
    const lastRisk = riskMonths[riskMonths.length - 1]?.month || "";
    aiInsight = `בחודשים ${firstRisk}-${lastRisk} צפויה ירידה בהכנסות בגלל ${totalExpiring} חוזים שפוקעים. מומלץ להתחיל חידוש חוזים מוקדם כדי למנוע פער הכנסות.`;
  }

  return (
    <Card>
      <h3 className="text-lg font-semibold mb-4">תחזית — 12 חודשים קדימה</h3>
      {isLoading ? (
        <div className="flex items-center justify-center h-[320px] text-muted">טוען נתונים...</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-[320px] text-muted">אין נתונים להצגה</div>
      ) : (
        <>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "הכנסה צפויה"]}
                  labelFormatter={(label) => {
                    const item = data.find((d) => d.month === label);
                    return item?.expiringContracts ? `${label} — ${item.expiringContracts} חוזים פוקעים` : String(label);
                  }}
                />
                {currentMonthlyIncome && (
                  <ReferenceLine y={currentMonthlyIncome} stroke="#22C55E" strokeDasharray="5 5" label="הכנסה נוכחית" />
                )}
                <Bar dataKey="expected" radius={[4, 4, 0, 0]}>
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.risk ? "#F59E0B" : "#1F4E79"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {aiInsight && (
            <div className="mt-4 bg-accent rounded-lg p-4 text-sm">
              <p className="font-medium text-primary mb-1">תובנת AI</p>
              <p className="text-gray-700">{aiInsight}</p>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
