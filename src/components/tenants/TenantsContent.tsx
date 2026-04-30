"use client";

import { useState, useMemo } from "react";
import { SearchInput } from "@/components/ui/SearchInput";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { formatCurrency, daysUntil, formatDate, cn } from "@/lib/utils";
import { useTenants, useDeleteTenant } from "@/hooks/useTenants";
import { useLegalEntities } from "@/hooks/useProperties";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Tenant } from "@/types/database";
import Link from "next/link";
import { ReliabilityBadge } from "@/components/ui/ReliabilityBadge";
import { TenantFormModal } from "./TenantFormModal";

const paymentStatusOptions = [
  { value: "", label: "כל הסטטוסים" },
  { value: "paid", label: "שולם" },
  { value: "debt", label: "חוב" },
];

const contractStatusOptions = [
  { value: "", label: "כל החוזים" },
  { value: "active", label: "פעיל" },
  { value: "expiring", label: "מסתיים בקרוב" },
  { value: "expired", label: "פג תוקף" },
];

export function TenantsContent() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Tenant | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: dbTenants = [], isLoading } = useTenants({ search });
  const { data: entities = [] } = useLegalEntities();
  const deleteMut = useDeleteTenant();
  const configured = isSupabaseConfigured();

  const tenants = useMemo(() => {
    return dbTenants.map((t) => {
      const activeContract = t.contracts?.find((c) => c.status === "active");
      const unit = t.unit;
      const property = unit?.property;
      const entity = property?.legal_entity;
      return {
        raw: t,
        id: t.id,
        full_name: t.full_name,
        id_number: t.id_number,
        phone: t.phone,
        email: t.email,
        unit: unit?.unit_identifier || "—",
        property: property?.name || "—",
        entity: entity?.name || "—",
        entity_id: entity?.id || "",
        rent: activeContract?.monthly_rent || 0,
        balance: 0,
        contract_end: activeContract?.end_date || "",
        status: activeContract?.status || (t.is_active ? "active" : "expired"),
        is_active: t.is_active,
        reliability_score: t.reliability_score ?? null,
      };
    });
  }, [dbTenants]);

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      if (entityFilter && t.entity_id !== entityFilter) return false;
      if (paymentFilter === "paid" && t.balance !== 0) return false;
      if (paymentFilter === "debt" && t.balance >= 0) return false;
      if (contractFilter === "active" && t.status !== "active") return false;
      if (contractFilter === "expired" && t.status !== "expired") return false;
      if (contractFilter === "expiring") {
        const days = daysUntil(t.contract_end);
        if (days > 45 || days < 0) return false;
      }
      return true;
    });
  }, [tenants, entityFilter, paymentFilter, contractFilter]);

  const entityOptions = [
    { value: "", label: "כל הישויות" },
    ...entities.map((e) => ({ value: e.id, label: e.name })),
  ];

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (t: Tenant) => {
    setEditing(t);
    setFormOpen(true);
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteMut.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "מחיקה נכשלה.");
    }
  };

  if (isLoading && configured) return <PageSpinner />;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="חיפוש שם / ת.ז / טלפון / יחידה..."
              className="sm:w-80"
            />
            <div className="flex gap-2 flex-wrap flex-1">
              <Select options={entityOptions} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="w-44" />
              <Select options={paymentStatusOptions} value={paymentFilter} onChange={(e) => setPaymentFilter(e.target.value)} className="w-36" />
              <Select options={contractStatusOptions} value={contractFilter} onChange={(e) => setContractFilter(e.target.value)} className="w-40" />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" />דייר חדש</Button>
          </div>
        </div>
      </Card>

      <div className="text-sm text-muted">{filtered.length} דיירים מוצגים</div>

      {!configured ? (
        <EmptyState icon={Users} title="לא נמצאו דיירים" description="חבר Supabase כדי לראות דיירים" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Users} title="לא נמצאו דיירים" description="נסה לשנות את הסינון או צור דייר חדש" />
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium text-muted">שם מלא</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">יחידה</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">נכס</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">טלפון</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden lg:table-cell">שכ&quot;ד</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">יתרה</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden lg:table-cell">סיום חוזה</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">אמינות</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tenant) => {
                  const days = tenant.contract_end ? daysUntil(tenant.contract_end) : -1;
                  return (
                    <tr key={tenant.id} className="border-b border-border hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium">{tenant.full_name}</td>
                      <td className="px-4 py-3 text-muted">{tenant.unit}</td>
                      <td className="px-4 py-3 text-muted">{tenant.property}</td>
                      <td className="px-4 py-3 text-muted hidden md:table-cell" dir="ltr">{tenant.phone}</td>
                      <td className="px-4 py-3 hidden lg:table-cell" dir="ltr">{tenant.rent > 0 ? formatCurrency(tenant.rent) : "—"}</td>
                      <td className="px-4 py-3">
                        <span dir="ltr" className={cn("font-medium", tenant.balance < 0 ? "text-danger" : tenant.balance === 0 ? "text-success" : "text-muted")}>
                          {tenant.balance === 0 ? "שולם" : formatCurrency(Math.abs(tenant.balance))}
                          {tenant.balance < 0 && " חוב"}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {tenant.contract_end ? (
                          <span className={cn("text-sm", days < 0 ? "text-danger font-medium" : days <= 30 ? "text-danger" : days <= 45 ? "text-warning" : "text-muted")}>
                            {formatDate(tenant.contract_end)}
                            {days > 0 && days <= 45 && ` (${days} ימים)`}
                            {days <= 0 && " (פג)"}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <ReliabilityBadge score={tenant.reliability_score} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={tenant.is_active ? "success" : "danger"}>
                          {tenant.is_active ? "פעיל" : "לא פעיל"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 items-center">
                          <Link href={`/tenants/${tenant.id}`} className="text-xs text-primary font-medium hover:underline">
                            פתח תיק
                          </Link>
                          <button
                            onClick={() => openEdit(tenant.raw)}
                            className="p-1 rounded hover:bg-gray-100 text-muted"
                            aria-label="ערוך"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(tenant.raw)}
                            className="p-1 rounded hover:bg-red-50 text-danger"
                            aria-label="מחק"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <TenantFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        tenant={editing}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
        title="מחיקת דייר"
        message={
          deleteTarget
            ? deleteError || `למחוק את הדייר "${deleteTarget.full_name}"? הפעולה אינה הפיכה.`
            : ""
        }
        variant="danger"
        confirmText="מחק"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
