"use client";

import { useState, useMemo } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { KPICard } from "@/components/dashboard/KPICard";
import { Button } from "@/components/ui/Button";
import { Badge, PaymentStatusBadge, CheckStatusBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { PaymentForm } from "@/components/payments/PaymentForm";
import { formatCurrency, formatDate, formatMonthYear } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CreditCard, AlertTriangle, FileCheck, Plus, Send } from "lucide-react";
import { useMonthlySchedule, useOverdueSchedule } from "@/hooks/usePayments";
import { useChecks } from "@/hooks/useChecks";
import Link from "next/link";

const tabs = [
  { id: "monthly", label: "חודשי" },
  { id: "debts", label: "חובות פתוחים" },
  { id: "checks", label: "לוח צ׳קים" },
];

function buildMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = -6; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const key = `${mm}/${yyyy}`;
    options.push({ value: key, label: formatMonthYear(key) });
  }
  return options;
}

const now = new Date();
const currentMonth = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

export function PaymentsContent() {
  const [activeTab, setActiveTab] = useState("monthly");
  const [month, setMonth] = useState(currentMonth);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [selectedRow, setSelectedRow] = useState<{
    tenantName: string;
    tenantId: string;
    contractId: string;
    scheduleId: string;
    monthYear: string;
    amount: number;
  } | null>(null);

  const { data: scheduleRows, isLoading: scheduleLoading } = useMonthlySchedule(month);
  const { data: overdueRows, isLoading: overdueLoading } = useOverdueSchedule();
  const { data: checks, isLoading: checksLoading } = useChecks();

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  // KPIs from schedule data
  const totalExpected = scheduleRows?.reduce((s, r) => s + r.expected_amount, 0) || 0;
  const totalCollected = scheduleRows?.filter((r) => r.status === "paid").reduce((s, r) => s + r.expected_amount, 0) || 0;
  const totalMissing = totalExpected - totalCollected;
  const collectionPercent = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  // Debts: group overdue rows by tenant
  const debtsByTenant = useMemo(() => {
    if (!overdueRows) return [];
    const map = new Map<string, { tenantId: string; tenantName: string; unit: string; property: string; totalDebt: number }>();
    for (const row of overdueRows) {
      const key = row.tenant_id;
      const existing = map.get(key);
      const unit = row.contract?.unit?.unit_identifier || "";
      const property = row.contract?.unit?.property?.name || "";
      if (existing) {
        existing.totalDebt += row.expected_amount;
      } else {
        map.set(key, {
          tenantId: key,
          tenantName: row.tenant?.full_name || "",
          unit,
          property,
          totalDebt: row.expected_amount,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt);
  }, [overdueRows]);

  const handleRecordPayment = (row: typeof scheduleRows extends (infer T)[] | undefined ? T : never) => {
    if (!row) return;
    setSelectedRow({
      tenantName: row.tenant?.full_name || "",
      tenantId: row.tenant_id,
      contractId: row.contract_id,
      scheduleId: row.id,
      monthYear: row.month_year,
      amount: row.expected_amount,
    });
    setShowPaymentForm(true);
  };

  return (
    <div className="space-y-4">
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "monthly" && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard title="צפוי" value={formatCurrency(totalExpected)} icon={CreditCard} color="blue" />
            <KPICard title="נגבה" value={formatCurrency(totalCollected)} icon={CreditCard} color="green" />
            <KPICard title="חסר" value={formatCurrency(totalMissing)} icon={AlertTriangle} color="red" />
            <KPICard title="% גביה" value={`${collectionPercent}%`} icon={CreditCard} color="purple" percent={collectionPercent} />
          </div>

          {/* Monthly table */}
          <Card noPadding>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold">תשלומים</h3>
                <Select
                  options={monthOptions}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button size="sm" onClick={() => setShowPaymentForm(true)}><Plus className="w-4 h-4" />רשום תשלום</Button>
            </div>
            {scheduleLoading ? (
              <div className="p-8"><PageSpinner /></div>
            ) : !scheduleRows || scheduleRows.length === 0 ? (
              <div className="p-8">
                <EmptyState icon={CreditCard} title="אין תשלומים לחודש זה" description="לא נמצאו רשומות תשלום עבור החודש הנבחר" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-gray-50">
                      <th className="text-right px-4 py-3 font-medium text-muted">דייר</th>
                      <th className="text-right px-4 py-3 font-medium text-muted">יחידה</th>
                      <th className="text-right px-4 py-3 font-medium text-muted">שכ״ד</th>
                      <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                      <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduleRows.map((row) => (
                      <tr key={row.id} className="border-b border-border hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          <Link href={`/tenants/${row.tenant_id}`} className="text-primary hover:underline">
                            {row.tenant?.full_name || "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {row.contract?.unit?.unit_identifier || "—"} · {row.contract?.unit?.property?.name || "—"}
                        </td>
                        <td className="px-4 py-3" dir="ltr">{formatCurrency(row.expected_amount)}</td>
                        <td className="px-4 py-3">
                          <PaymentStatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3">
                          {row.status !== "paid" && (
                            <Button variant="ghost" size="sm" onClick={() => handleRecordPayment(row)}>
                              <Plus className="w-3 h-3" />רשום
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "debts" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">חובות פתוחים — {debtsByTenant.length} דיירים</h3>
              <Button variant="outline" size="sm"><Send className="w-4 h-4" />שלח תזכורת לכולם</Button>
            </div>
            {overdueLoading ? (
              <PageSpinner />
            ) : debtsByTenant.length === 0 ? (
              <EmptyState icon={CreditCard} title="אין חובות פתוחים" description="כל הדיירים שילמו" />
            ) : (
              <div className="space-y-3">
                {debtsByTenant.map((t) => (
                  <div key={t.tenantId} className="flex items-center justify-between p-4 bg-red-50/50 rounded-lg border border-red-100">
                    <div>
                      <Link href={`/tenants/${t.tenantId}`} className="font-medium text-primary hover:underline">{t.tenantName}</Link>
                      <p className="text-xs text-muted">{t.unit} · {t.property}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-danger font-bold text-lg" dir="ltr">{formatCurrency(t.totalDebt)}</span>
                      <Button variant="outline" size="sm"><Send className="w-3 h-3" />תזכורת</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "checks" && (
        <Card noPadding>
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">לוח צ׳קים — ממוין לפי תאריך פירעון</h3>
          </div>
          {checksLoading ? (
            <div className="p-8"><PageSpinner /></div>
          ) : !checks || checks.length === 0 ? (
            <div className="p-8">
              <EmptyState icon={FileCheck} title="אין צ׳קים" description="לא נמצאו צ׳קים במערכת" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-gray-50">
                    <th className="text-right px-4 py-3 font-medium text-muted">דייר</th>
                    <th className="text-right px-4 py-3 font-medium text-muted">מספר צ׳ק</th>
                    <th className="text-right px-4 py-3 font-medium text-muted">בנק</th>
                    <th className="text-right px-4 py-3 font-medium text-muted">סכום</th>
                    <th className="text-right px-4 py-3 font-medium text-muted">עבור חודש</th>
                    <th className="text-right px-4 py-3 font-medium text-muted">פירעון</th>
                    <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((check) => (
                    <tr key={check.id} className={cn("border-b border-border hover:bg-gray-50", check.status === "pending" && "bg-yellow-50/50")}>
                      <td className="px-4 py-3 font-medium">{check.tenant?.full_name || "—"}</td>
                      <td className="px-4 py-3" dir="ltr">{check.check_number}</td>
                      <td className="px-4 py-3 text-muted">{check.bank_name || "—"}</td>
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
          )}
        </Card>
      )}

      {/* Payment form modal */}
      <PaymentForm
        isOpen={showPaymentForm}
        onClose={() => {
          setShowPaymentForm(false);
          setSelectedRow(null);
        }}
        tenantName={selectedRow?.tenantName || ""}
        tenantId={selectedRow?.tenantId}
        contractId={selectedRow?.contractId}
        scheduleId={selectedRow?.scheduleId}
        defaultMonth={selectedRow?.monthYear || month}
        defaultAmount={selectedRow?.amount}
      />
    </div>
  );
}
