"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils";
import { ExternalLink, Edit } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockTenantDetail } from "@/lib/mock-data";

export function ContractDetails({ tenant }: { tenant: MockTenantDetail }) {
  const c = tenant.contract;
  const days = daysUntil(c.end_date);
  const year2Rent = Math.round(c.monthly_rent * (1 + c.annual_increase_percent / 100));

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">פרטי חוזה</h3>
        <Button variant="ghost" size="sm">
          <Edit className="w-4 h-4" />
          ערוך
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Dates */}
        <div>
          <p className="text-xs text-muted mb-1">תאריך התחלה</p>
          <p className="text-sm font-medium">{formatDate(c.start_date)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">תאריך סיום</p>
          <p className={cn("text-sm font-medium", days <= 30 ? "text-danger" : days <= 45 ? "text-warning" : "")}>
            {formatDate(c.end_date)}
            {days > 0 && <span className="text-xs mr-1">({days} ימים)</span>}
            {days <= 0 && <span className="text-xs text-danger mr-1">(פג תוקף)</span>}
          </p>
        </div>

        {/* Rent by year */}
        <div>
          <p className="text-xs text-muted mb-1">שכ&quot;ד שנה 1</p>
          <p className="text-sm font-medium" dir="ltr">{formatCurrency(c.monthly_rent)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">שכ&quot;ד שנה 2 ({c.annual_increase_percent}% עלייה)</p>
          <p className="text-sm font-medium" dir="ltr">{formatCurrency(year2Rent)}</p>
        </div>

        {/* Fees */}
        <div>
          <p className="text-xs text-muted mb-1">ועד בית</p>
          <p className="text-sm font-medium" dir="ltr">{formatCurrency(c.building_fee)}</p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">ארנונה</p>
          <p className="text-sm font-medium" dir="ltr">{formatCurrency(c.arnona)}</p>
        </div>

        {/* Payment method */}
        <div>
          <p className="text-xs text-muted mb-1">אמצעי תשלום</p>
          <p className="text-sm font-medium">
            {c.payment_method === "checks" ? "צ׳קים" : c.payment_method === "transfer" ? "העברה" : "מזומן"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted mb-1">צ׳קים</p>
          <p className="text-sm font-medium">
            הביא {c.checks_received} / {c.total_checks}
            {c.checks_received < c.total_checks && (
              <span className="text-danger text-xs mr-1">(חסרים {c.total_checks - c.checks_received})</span>
            )}
          </p>
        </div>
      </div>

      {c.google_drive_url && (
        <div className="mt-4 pt-4 border-t border-border">
          <a href={c.google_drive_url} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline flex items-center gap-1">
            <ExternalLink className="w-4 h-4" />
            פתח חוזה ב-Google Drive
          </a>
        </div>
      )}
    </Card>
  );
}
