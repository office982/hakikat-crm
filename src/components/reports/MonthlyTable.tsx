"use client";

import { Card } from "@/components/ui/Card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { MonthlyTableRow } from "@/hooks/useReports";

interface MonthlyTableProps {
  data: MonthlyTableRow[];
  isLoading?: boolean;
}

export function MonthlyTable({ data, isLoading }: MonthlyTableProps) {
  return (
    <Card noPadding>
      <div className="p-4 border-b border-border">
        <h3 className="text-lg font-semibold">פירוט חודשי</h3>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted">טוען נתונים...</div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-muted">אין נתונים להצגה</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-gray-50">
                <th className="text-right px-4 py-2 font-medium text-muted">חודש</th>
                <th className="text-right px-4 py-2 font-medium text-muted">צפוי</th>
                <th className="text-right px-4 py-2 font-medium text-muted">בפועל</th>
                <th className="text-right px-4 py-2 font-medium text-muted">פער</th>
                <th className="text-right px-4 py-2 font-medium text-muted">% גביה</th>
                <th className="text-right px-4 py-2 font-medium text-muted">שילמו</th>
                <th className="text-right px-4 py-2 font-medium text-muted">לא שילמו</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.monthYear} className="border-b border-border hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{row.month}</td>
                  <td className="px-4 py-2" dir="ltr">{formatCurrency(row.expected)}</td>
                  <td className="px-4 py-2" dir="ltr">{formatCurrency(row.actual)}</td>
                  <td className="px-4 py-2" dir="ltr">
                    <span className={row.gap > 0 ? "text-danger" : "text-success"}>
                      {formatCurrency(row.gap)}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn(
                      "font-medium",
                      row.percent >= 90 ? "text-success" : row.percent >= 70 ? "text-warning" : "text-danger"
                    )}>
                      {row.percent}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-success">{row.paidCount}</td>
                  <td className="px-4 py-2 text-danger">{row.unpaidCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
