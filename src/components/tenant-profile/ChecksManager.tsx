"use client";

import { Card } from "@/components/ui/Card";
import { CheckStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, formatMonthYear } from "@/lib/utils";
import { Plus } from "lucide-react";
import type { MockCheck } from "@/lib/mock-data";

interface ChecksManagerProps {
  checks: MockCheck[];
  totalRequired: number;
}

export function ChecksManager({ checks, totalRequired }: ChecksManagerProps) {
  const deposited = checks.filter((c) => c.status === "deposited").length;
  const pending = checks.filter((c) => c.status === "pending").length;
  const bounced = checks.filter((c) => c.status === "bounced").length;
  const lastCheck = checks.length > 0 ? checks[checks.length - 1] : null;

  return (
    <Card noPadding>
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">ניהול צ׳קים</h3>
          <Button size="sm">
            <Plus className="w-4 h-4" />
            הוסף צ׳קים
          </Button>
        </div>
        <div className="flex gap-6 text-sm">
          <span>הביא <span className="font-bold">{checks.length}</span> צ׳קים</span>
          <span className="text-success">הופקדו: {deposited}</span>
          <span className="text-warning">ממתינים: {pending}</span>
          {bounced > 0 && <span className="text-danger">חזרו: {bounced}</span>}
          {lastCheck && (
            <span className="text-muted">מכסה עד: {formatMonthYear(lastCheck.for_month)}</span>
          )}
          {checks.length < totalRequired && (
            <span className="text-danger font-medium">חסרים {totalRequired - checks.length} צ׳קים</span>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-gray-50">
              <th className="text-right px-4 py-3 font-medium text-muted">מספר צ׳ק</th>
              <th className="text-right px-4 py-3 font-medium text-muted">בנק</th>
              <th className="text-right px-4 py-3 font-medium text-muted">סכום</th>
              <th className="text-right px-4 py-3 font-medium text-muted">עבור חודש</th>
              <th className="text-right px-4 py-3 font-medium text-muted">תאריך פירעון</th>
              <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => (
              <tr key={check.id} className="border-b border-border hover:bg-gray-50">
                <td className="px-4 py-3 font-medium" dir="ltr">{check.check_number}</td>
                <td className="px-4 py-3 text-muted">{check.bank_name}</td>
                <td className="px-4 py-3" dir="ltr">{formatCurrency(check.amount)}</td>
                <td className="px-4 py-3">{formatMonthYear(check.for_month)}</td>
                <td className="px-4 py-3">{formatDate(check.due_date)}</td>
                <td className="px-4 py-3">
                  <CheckStatusBadge status={check.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
