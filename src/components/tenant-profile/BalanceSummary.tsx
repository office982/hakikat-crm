"use client";

import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import type { MockPaymentRow } from "@/lib/mock-data";

export function BalanceSummary({ schedule }: { schedule: MockPaymentRow[] }) {
  const totalCharged = schedule.reduce((sum, r) => sum + r.expected_amount, 0);
  const totalPaid = schedule.reduce((sum, r) => sum + r.paid_amount, 0);
  const openBalance = totalCharged - totalPaid;
  const paidAhead = schedule.filter((r) => r.status === "paid" && new Date(r.month_year.split("/").reverse().join("-") + "-01") > new Date()).length;

  const chartData = schedule.slice(0, 12).map((r) => ({
    month: r.month_year.split("/")[0] + "/" + r.month_year.split("/")[1].slice(2),
    expected: r.expected_amount,
    actual: r.paid_amount,
  }));

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="סה״כ חויב" value={formatCurrency(totalCharged)} />
        <SummaryCard label="סה״כ שולם" value={formatCurrency(totalPaid)} color="text-success" />
        <SummaryCard
          label="יתרה פתוחה"
          value={formatCurrency(openBalance)}
          color={openBalance > 0 ? "text-danger" : "text-success"}
          subtitle={openBalance > 0 ? "חוב" : openBalance < 0 ? "זיכוי" : "מאוזן"}
        />
        <SummaryCard label="חודשים מראש" value={String(paidAhead)} subtitle="חודשים" />
      </div>

      {/* Chart */}
      <Card>
        <h3 className="text-lg font-semibold mb-4">צפוי מול בפועל</h3>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value)),
                  name === "expected" ? "צפוי" : "בפועל",
                ]}
              />
              <Legend formatter={(v) => (v === "expected" ? "צפוי" : "בפועל")} />
              <Bar dataKey="expected" fill="#E5E7EB" name="expected" radius={[4, 4, 0, 0]} />
              <Bar dataKey="actual" fill="#22C55E" name="actual" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, color, subtitle }: { label: string; value: string; color?: string; subtitle?: string }) {
  return (
    <Card>
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className={cn("text-xl font-bold", color || "text-gray-900")} dir="ltr">{value}</p>
      {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
    </Card>
  );
}
