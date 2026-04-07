"use client";

import { useParams } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, ArrowRight, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

const mockExpenses = [
  { id: "e1", supplier: "יוסי בטונים", description: "יציקת רצפות", amount: 45000, invoice_date: "2026-01-15", status: "paid" },
  { id: "e2", supplier: "חברת החשמל", description: "חיבור חשמל", amount: 12400, invoice_date: "2026-02-20", status: "unpaid" },
  { id: "e3", supplier: "מסגריית דוד", description: "דלתות ושערים", amount: 28000, invoice_date: "2026-02-28", status: "paid" },
  { id: "e4", supplier: "צבע ואור", description: "צביעה פנימית וחיצונית", amount: 18500, invoice_date: "2026-03-10", status: "unpaid" },
  { id: "e5", supplier: "אינסטלציית שלום", description: "צנרת מים וביוב", amount: 32000, invoice_date: "2026-03-15", status: "paid" },
  { id: "e6", supplier: "גגות ישראל", description: "איטום גג", amount: 15000, invoice_date: "2026-03-20", status: "unpaid" },
];

const statusMap: Record<string, { label: string; variant: "success" | "danger" | "warning" }> = {
  paid: { label: "שולם", variant: "success" },
  unpaid: { label: "לא שולם", variant: "danger" },
  partial: { label: "חלקי", variant: "warning" },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const totalBudget = 250000;
  const totalSpent = mockExpenses.reduce((s, e) => s + e.amount, 0);
  const remaining = totalBudget - totalSpent;
  const percent = Math.round((totalSpent / totalBudget) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/projects" className="p-1 rounded-lg hover:bg-gray-100">
          <ArrowRight className="w-5 h-5 text-muted" />
        </Link>
        <h1 className="text-xl font-bold">שיפוץ כלבייה 1</h1>
        <Badge variant="success">פעיל</Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-muted mb-1">תקציב כולל</p>
          <p className="text-xl font-bold" dir="ltr">{formatCurrency(totalBudget)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">הוצאה בפועל</p>
          <p className="text-xl font-bold text-primary" dir="ltr">{formatCurrency(totalSpent)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">נותר</p>
          <p className={cn("text-xl font-bold", remaining > 0 ? "text-success" : "text-danger")} dir="ltr">{formatCurrency(remaining)}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted mb-1">% ניצול</p>
          <p className={cn("text-xl font-bold", percent > 90 ? "text-danger" : "text-warning")}>{percent}%</p>
          <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
            <div className={cn("h-2 rounded-full", percent > 90 ? "bg-danger" : "bg-warning")} style={{ width: `${Math.min(percent, 100)}%` }} />
          </div>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card noPadding>
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-lg font-semibold">הוצאות לפי ספק</h3>
          <Button size="sm"><Plus className="w-4 h-4" />הוסף הוצאה</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-right px-4 py-3 font-medium text-muted">ספק</th>
                <th className="text-right px-4 py-3 font-medium text-muted">תיאור</th>
                <th className="text-right px-4 py-3 font-medium text-muted">סכום</th>
                <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">תאריך חשבונית</th>
                <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {mockExpenses.map((expense) => {
                const s = statusMap[expense.status];
                return (
                  <tr key={expense.id} className="border-b border-border hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{expense.supplier}</td>
                    <td className="px-4 py-3 text-muted">{expense.description}</td>
                    <td className="px-4 py-3 font-medium" dir="ltr">{formatCurrency(expense.amount)}</td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell">{formatDate(expense.invoice_date)}</td>
                    <td className="px-4 py-3"><Badge variant={s.variant}>{s.label}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {expense.status === "unpaid" && (
                          <button className="text-xs text-primary font-medium hover:underline">סמן כשולם</button>
                        )}
                        <button className="p-1 rounded hover:bg-gray-100 text-muted"><ImageIcon className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
