"use client";

import { useState } from "react";
import { Tabs } from "@/components/ui/Tabs";
import { Card } from "@/components/ui/Card";
import { KPICard } from "@/components/dashboard/KPICard";
import { Button } from "@/components/ui/Button";
import { Badge, PaymentStatusBadge, CheckStatusBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate, formatMonthYear } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { CreditCard, AlertTriangle, FileCheck, Plus, Send } from "lucide-react";
import { mockTenants } from "@/lib/mock-data";
import Link from "next/link";

const tabs = [
  { id: "monthly", label: "חודשי" },
  { id: "debts", label: "חובות פתוחים" },
  { id: "checks", label: "לוח צ׳קים" },
];

const now = new Date();
const currentMonth = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

export function PaymentsContent() {
  const [activeTab, setActiveTab] = useState("monthly");
  const [month, setMonth] = useState(currentMonth);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const tenantsWithDebt = mockTenants.filter((t) => t.balance < 0);
  const totalExpected = mockTenants.reduce((s, t) => s + t.rent, 0);
  const totalCollected = mockTenants.filter((t) => t.balance >= 0).reduce((s, t) => s + t.rent, 0);
  const totalMissing = totalExpected - totalCollected;
  const collectionPercent = Math.round((totalCollected / totalExpected) * 100);

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
              <h3 className="font-semibold">תשלומים — {formatMonthYear(month)}</h3>
              <Button size="sm" onClick={() => setShowPaymentForm(true)}><Plus className="w-4 h-4" />רשום תשלום</Button>
            </div>
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
                  {mockTenants.filter((t) => t.is_active).map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/tenants/${t.id}`} className="text-primary hover:underline">{t.full_name}</Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{t.unit} · {t.property}</td>
                      <td className="px-4 py-3" dir="ltr">{formatCurrency(t.rent)}</td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={t.balance < 0 ? "overdue" : "paid"} />
                      </td>
                      <td className="px-4 py-3">
                        {t.balance < 0 && (
                          <Button variant="ghost" size="sm"><Plus className="w-3 h-3" />רשום</Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "debts" && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">חובות פתוחים — {tenantsWithDebt.length} דיירים</h3>
              <Button variant="outline" size="sm"><Send className="w-4 h-4" />שלח תזכורת לכולם</Button>
            </div>
            {tenantsWithDebt.length === 0 ? (
              <EmptyState icon={CreditCard} title="אין חובות פתוחים" description="כל הדיירים שילמו" />
            ) : (
              <div className="space-y-3">
                {tenantsWithDebt.sort((a, b) => a.balance - b.balance).map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-4 bg-red-50/50 rounded-lg border border-red-100">
                    <div>
                      <Link href={`/tenants/${t.id}`} className="font-medium text-primary hover:underline">{t.full_name}</Link>
                      <p className="text-xs text-muted">{t.unit} · {t.property}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-danger font-bold text-lg" dir="ltr">{formatCurrency(Math.abs(t.balance))}</span>
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
                {mockTenants.slice(0, 8).map((t, i) => (
                  <tr key={i} className={cn("border-b border-border hover:bg-gray-50", i < 2 && "bg-yellow-50/50")}>
                    <td className="px-4 py-3 font-medium">{t.full_name}</td>
                    <td className="px-4 py-3" dir="ltr">{1001 + i}</td>
                    <td className="px-4 py-3 text-muted">לאומי</td>
                    <td className="px-4 py-3" dir="ltr">{formatCurrency(t.rent)}</td>
                    <td className="px-4 py-3">{formatMonthYear(`0${4 + Math.floor(i / 3)}/2026`.slice(-7))}</td>
                    <td className="px-4 py-3">{formatDate(`2026-0${4 + Math.floor(i / 3)}-0${1 + (i % 28)}`)}</td>
                    <td className="px-4 py-3">
                      <CheckStatusBadge status={i < 2 ? "pending" : i < 5 ? "deposited" : "pending"} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
