"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge, CheckStatusBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate, formatMonthYear, daysUntil } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FileCheck, ScanLine } from "lucide-react";
import { useChecks, useUpdateCheckStatus, useBounceCheck } from "@/hooks/useChecks";
import { isSupabaseConfigured } from "@/lib/supabase";
import { mockTenants } from "@/lib/mock-data";
import { Button } from "@/components/ui/Button";
import { CheckImageUploader } from "@/components/checks/CheckImageUploader";

const statusOptions = [
  { value: "", label: "כל הסטטוסים" },
  { value: "pending", label: "ממתין" },
  { value: "deposited", label: "הופקד" },
  { value: "bounced", label: "חזר" },
];

// Mock checks for display when DB is empty
const mockChecks = mockTenants.slice(0, 10).flatMap((t, ti) =>
  [0, 1, 2].map((mi) => ({
    id: `mock-${ti}-${mi}`,
    tenant_name: t.full_name,
    check_number: String(1001 + ti * 3 + mi),
    bank_name: ["לאומי", "הפועלים", "דיסקונט"][ti % 3],
    amount: t.rent,
    for_month: `0${4 + mi}/2026`.slice(-7),
    due_date: `2026-0${4 + mi}-01`,
    status: mi === 0 && ti < 4 ? "deposited" as const : "pending" as const,
  }))
);

export function ChecksContent() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const { data: dbChecks = [] } = useChecks({ status: statusFilter || undefined });
  const updateStatus = useUpdateCheckStatus();
  const bounceCheck = useBounceCheck();

  const checks = isSupabaseConfigured() && dbChecks.length > 0
    ? dbChecks.map((c) => ({
        id: c.id,
        tenant_id: c.tenant_id,
        tenant_name: c.tenant?.full_name || "",
        check_number: c.check_number,
        bank_name: c.bank_name || "",
        amount: c.amount,
        for_month: c.for_month,
        due_date: c.due_date,
        status: c.status,
      }))
    : mockChecks.map((c) => ({ ...c, tenant_id: "" }));

  const filtered = checks.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!c.tenant_name.toLowerCase().includes(s) && !c.check_number.includes(s)) return false;
    }
    return true;
  }).sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const pending = checks.filter((c) => c.status === "pending").length;
  const deposited = checks.filter((c) => c.status === "deposited").length;
  const thisWeek = checks.filter((c) => c.status === "pending" && daysUntil(c.due_date) <= 7 && daysUntil(c.due_date) >= 0).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <p className="text-xs text-muted">ממתינים</p>
          <p className="text-2xl font-bold text-warning">{pending}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">הופקדו</p>
          <p className="text-2xl font-bold text-success">{deposited}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">פירעון השבוע</p>
          <p className="text-2xl font-bold text-danger">{thisWeek}</p>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex gap-3 flex-wrap items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="חיפוש דייר / מספר צ׳ק..." className="w-64" />
          <Select options={statusOptions} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40" />
          <div className="mr-auto">
            <Button onClick={() => setScannerOpen(true)} size="sm">
              <ScanLine className="w-4 h-4" />
              סרוק צ׳קים
            </Button>
          </div>
        </div>
      </Card>

      <CheckImageUploader isOpen={scannerOpen} onClose={() => setScannerOpen(false)} />

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState icon={FileCheck} title="לא נמצאו צ׳קים" />
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium text-muted">דייר</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">מספר צ׳ק</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">בנק</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סכום</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">עבור חודש</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">תאריך פירעון</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">פעולה</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((check) => {
                  const days = daysUntil(check.due_date);
                  const isUrgent = check.status === "pending" && days <= 7 && days >= 0;
                  return (
                    <tr key={check.id} className={cn("border-b border-border hover:bg-gray-50", isUrgent && "bg-yellow-50/50")}>
                      <td className="px-4 py-3 font-medium">{check.tenant_name}</td>
                      <td className="px-4 py-3" dir="ltr">{check.check_number}</td>
                      <td className="px-4 py-3 text-muted">{check.bank_name}</td>
                      <td className="px-4 py-3 font-medium" dir="ltr">{formatCurrency(check.amount)}</td>
                      <td className="px-4 py-3">{formatMonthYear(check.for_month)}</td>
                      <td className="px-4 py-3">
                        <span className={cn(isUrgent && "text-danger font-medium")}>
                          {formatDate(check.due_date)}
                          {isUrgent && ` (${days} ימים)`}
                        </span>
                      </td>
                      <td className="px-4 py-3"><CheckStatusBadge status={check.status} /></td>
                      <td className="px-4 py-3">
                        {check.status === "pending" && (
                          <div className="flex gap-3">
                            <button
                              onClick={() => updateStatus.mutate({ id: check.id, status: "deposited" })}
                              className="text-xs text-primary font-medium hover:underline"
                            >
                              סמן הופקד
                            </button>
                            {check.tenant_id && (
                              <button
                                onClick={() => {
                                  if (!confirm(`לסמן את הצ'ק עבור ${check.for_month} כצ'ק חוזר?`)) return;
                                  bounceCheck.mutate({
                                    tenant_id: check.tenant_id,
                                    for_month: check.for_month,
                                  });
                                }}
                                className="text-xs text-danger font-medium hover:underline"
                              >
                                צ'ק חוזר
                              </button>
                            )}
                          </div>
                        )}
                        {check.status === "deposited" && check.tenant_id && (
                          <button
                            onClick={() => {
                              if (!confirm(`לסמן את הצ'ק עבור ${check.for_month} כצ'ק חוזר?`)) return;
                              bounceCheck.mutate({
                                tenant_id: check.tenant_id,
                                for_month: check.for_month,
                              });
                            }}
                            className="text-xs text-danger font-medium hover:underline"
                          >
                            צ'ק חוזר
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
