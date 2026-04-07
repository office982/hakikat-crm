"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ContractStatusBadge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";
import { mockTenants } from "@/lib/mock-data";

const statusOptions = [
  { value: "", label: "כל הסטטוסים" },
  { value: "active", label: "פעיל" },
  { value: "expiring", label: "פוקע בקרוב" },
  { value: "expired", label: "פג תוקף" },
];

const mockContracts = mockTenants.map((t) => ({
  id: `contract-${t.id}`,
  tenant_name: t.full_name,
  tenant_id: t.id,
  unit: t.unit,
  property: t.property,
  entity: t.entity,
  start_date: "2025-09-01",
  end_date: t.contract_end,
  monthly_rent: t.rent,
  status: t.status,
}));

export function ContractList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const filtered = useMemo(() => {
    return mockContracts.filter((c) => {
      if (search) {
        const s = search.toLowerCase();
        if (!c.tenant_name.toLowerCase().includes(s) && !c.unit.toLowerCase().includes(s)) return false;
      }
      if (statusFilter === "active" && c.status !== "active") return false;
      if (statusFilter === "expired" && c.status !== "expired") return false;
      if (statusFilter === "expiring") {
        const days = daysUntil(c.end_date);
        if (days > 45 || days < 0) return false;
      }
      return true;
    });
  }, [search, statusFilter]);

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex gap-3 flex-wrap flex-1">
            <SearchInput value={search} onChange={setSearch} placeholder="חיפוש דייר / יחידה..." className="w-64" />
            <Select options={statusOptions} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-40" />
          </div>
          <Link href="/contracts/new">
            <Button size="sm">
              <Plus className="w-4 h-4" />
              חוזה חדש
            </Button>
          </Link>
        </div>
      </Card>

      <div className="text-sm text-muted">{filtered.length} חוזים</div>

      {filtered.length === 0 ? (
        <EmptyState icon={FileText} title="לא נמצאו חוזים" />
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium text-muted">דייר</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">יחידה</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">נכס</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden lg:table-cell">ישות</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">התחלה</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סיום</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">ימים לסיום</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">שכ&quot;ד</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const days = daysUntil(c.end_date);
                  return (
                    <tr key={c.id} className="border-b border-border hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/tenants/${c.tenant_id}`} className="text-primary hover:underline">
                          {c.tenant_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{c.unit}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell">{c.property}</td>
                      <td className="px-4 py-3 text-muted hidden lg:table-cell text-xs">{c.entity}</td>
                      <td className="px-4 py-3">{formatDate(c.start_date)}</td>
                      <td className="px-4 py-3">{formatDate(c.end_date)}</td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={cn(
                          "font-medium",
                          days <= 0 ? "text-danger" : days <= 30 ? "text-danger" : days <= 45 ? "text-warning" : "text-muted"
                        )}>
                          {days <= 0 ? "פג" : `${days} ימים`}
                        </span>
                      </td>
                      <td className="px-4 py-3" dir="ltr">{formatCurrency(c.monthly_rent)}</td>
                      <td className="px-4 py-3">
                        <ContractStatusBadge status={c.status} />
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
