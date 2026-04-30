"use client";

import { Card } from "@/components/ui/Card";
import { PaymentStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatMonthYear, formatDate } from "@/lib/utils";
import { Plus, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PaymentScheduleRow } from "@/types/tenant-profile";

interface PaymentScheduleTableProps {
  schedule: PaymentScheduleRow[];
  onRecordPayment: (monthYear: string) => void;
}

export function PaymentScheduleTable({ schedule, onRecordPayment }: PaymentScheduleTableProps) {
  const totalExpected = schedule.reduce((sum, r) => sum + r.expected_amount, 0);
  const totalPaid = schedule.reduce((sum, r) => sum + r.paid_amount, 0);
  const totalBalance = totalExpected - totalPaid;

  return (
    <Card noPadding>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="text-lg font-semibold">לוח תשלומים</h3>
        <div className="flex gap-4 text-sm">
          <span className="text-muted">צפוי: <span className="font-medium text-gray-900" dir="ltr">{formatCurrency(totalExpected)}</span></span>
          <span className="text-muted">שולם: <span className="font-medium text-success" dir="ltr">{formatCurrency(totalPaid)}</span></span>
          <span className="text-muted">יתרה: <span className={cn("font-medium", totalBalance > 0 ? "text-danger" : "text-success")} dir="ltr">{formatCurrency(totalBalance)}</span></span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gray-50">
              <th className="text-right px-4 py-3 font-medium text-muted">חודש</th>
              <th className="text-right px-4 py-3 font-medium text-muted">שנה</th>
              <th className="text-right px-4 py-3 font-medium text-muted">סכום צפוי</th>
              <th className="text-right px-4 py-3 font-medium text-muted">שולם</th>
              <th className="text-right px-4 py-3 font-medium text-muted">יתרה</th>
              <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">תאריך תשלום</th>
              <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">אמצעי</th>
              <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-border transition-colors",
                  row.status === "paid" ? "bg-green-50/50" :
                  row.status === "partial" ? "bg-amber-50/50" :
                  row.status === "overdue" ? "bg-red-50/50" :
                  "hover:bg-gray-50"
                )}
              >
                <td className="px-4 py-3 font-medium">{formatMonthYear(row.month_year)}</td>
                <td className="px-4 py-3 text-muted">{row.year_number}</td>
                <td className="px-4 py-3" dir="ltr">{formatCurrency(row.expected_amount)}</td>
                <td className="px-4 py-3" dir="ltr">
                  {row.paid_amount > 0 ? (
                    <span className="text-success font-medium">{formatCurrency(row.paid_amount)}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  {row.balance > 0 ? (
                    <span className="text-danger font-medium">{formatCurrency(row.balance)}</span>
                  ) : (
                    <span className="text-success">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">
                  {row.payment_date ? formatDate(row.payment_date) : "—"}
                </td>
                <td className="px-4 py-3 text-muted hidden md:table-cell">
                  {row.payment_method === "check" ? "צ׳ק" : row.payment_method === "transfer" ? "העברה" : row.payment_method === "cash" ? "מזומן" : "—"}
                </td>
                <td className="px-4 py-3">
                  <PaymentStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {row.status !== "paid" && (
                      <button
                        onClick={() => onRecordPayment(row.month_year)}
                        className="p-1 rounded hover:bg-gray-100 text-primary"
                        title="רשום תשלום"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    )}
                    {row.receipt_url && (
                      <button className="p-1 rounded hover:bg-gray-100 text-muted" title="צפה בקבלה">
                        <Receipt className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
