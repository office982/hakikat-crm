"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge, ContractStatusBadge } from "@/components/ui/Badge";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Plus, FileText } from "lucide-react";
import Link from "next/link";
import { useContracts } from "@/hooks/useContracts";

const statusOptions = [
  { value: "", label: "כל הסטטוסים" },
  { value: "active", label: "פעיל" },
  { value: "expiring", label: "פוקע בקרוב" },
  { value: "expired", label: "פג תוקף" },
];

export function ContractList() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // Fetch active/expired from hook; "expiring" is client-side filtering
  const hookStatus = statusFilter === "expiring" ? "active" : statusFilter || undefined;
  const { data: contracts, isLoading } = useContracts({
    status: hookStatus,
  });

  const filtered = useMemo(() => {
    if (!contracts) return [];
    let result = contracts;

    // Client-side search filtering (tenant name / unit)
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((c) =>
        (c.tenant?.full_name || "").toLowerCase().includes(s) ||
        (c.unit?.unit_identifier || "").toLowerCase().includes(s)
      );
    }

    if (statusFilter === "expiring") {
      result = result.filter((c) => {
        const days = daysUntil(c.end_date);
        return days >= 0 && days <= 45;
      });
    }
    return result;
  }, [contracts, statusFilter, search]);

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

      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
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
                              {c.tenant?.full_name || "—"}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted">{c.unit?.unit_identifier || "—"}</td>
                          <td className="px-4 py-3 text-muted hidden md:table-cell">{c.unit?.property?.name || "—"}</td>
                          <td className="px-4 py-3 text-muted hidden lg:table-cell text-xs">{c.legal_entity?.name || "—"}</td>
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
        </>
      )}
    </div>
  );
}
