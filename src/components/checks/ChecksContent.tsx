"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { CheckStatusBadge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageSpinner } from "@/components/ui/Spinner";
import { formatCurrency, formatDate, formatMonthYear, daysUntil } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FileCheck, ScanLine, Plus, Pencil, Trash2 } from "lucide-react";
import {
  useChecks,
  useUpdateCheckStatus,
  useBounceCheck,
  useDeleteCheck,
} from "@/hooks/useChecks";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { CheckImageUploader } from "@/components/checks/CheckImageUploader";
import { CheckFormModal } from "@/components/checks/CheckFormModal";
import type { Check } from "@/types/database";

const statusOptions = [
  { value: "", label: "כל הסטטוסים" },
  { value: "pending", label: "ממתין" },
  { value: "deposited", label: "הופקד" },
  { value: "bounced", label: "חזר" },
];

export function ChecksContent() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Check | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Check | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [bounceTarget, setBounceTarget] = useState<Check | null>(null);

  const { data: dbChecks = [], isLoading } = useChecks({ status: statusFilter || undefined });
  const updateStatus = useUpdateCheckStatus();
  const bounceCheck = useBounceCheck();
  const deleteMut = useDeleteCheck();
  const configured = isSupabaseConfigured();

  if (isLoading && configured) return <PageSpinner />;

  const filtered = dbChecks
    .filter((c) => {
      if (statusFilter && c.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        const tenantName = c.tenant?.full_name || "";
        if (!tenantName.toLowerCase().includes(s) && !c.check_number.includes(s)) return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const pending = dbChecks.filter((c) => c.status === "pending").length;
  const deposited = dbChecks.filter((c) => c.status === "deposited").length;
  const thisWeek = dbChecks.filter(
    (c) => c.status === "pending" && daysUntil(c.due_date) <= 7 && daysUntil(c.due_date) >= 0
  ).length;

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (c: Check) => {
    setEditing(c);
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
  const confirmBounce = () => {
    if (!bounceTarget) return;
    bounceCheck.mutate({
      tenant_id: bounceTarget.tenant_id,
      for_month: bounceTarget.for_month,
    });
    setBounceTarget(null);
  };

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
          <div className="mr-auto flex gap-2">
            <Button onClick={openCreate} size="sm">
              <Plus className="w-4 h-4" />צ'ק חדש
            </Button>
            <Button onClick={() => setScannerOpen(true)} size="sm" variant="outline">
              <ScanLine className="w-4 h-4" />
              סרוק צ׳קים
            </Button>
          </div>
        </div>
      </Card>

      <CheckImageUploader isOpen={scannerOpen} onClose={() => setScannerOpen(false)} />

      {/* Table */}
      {!configured ? (
        <EmptyState icon={FileCheck} title="לא נמצאו צ׳קים" description="חבר Supabase כדי לראות צ'קים" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileCheck} title="לא נמצאו צ'קים" description="הוסף צ'ק חדש או שנה סינון" />
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
                  <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((check) => {
                  const days = daysUntil(check.due_date);
                  const isUrgent = check.status === "pending" && days <= 7 && days >= 0;
                  return (
                    <tr key={check.id} className={cn("border-b border-border hover:bg-gray-50", isUrgent && "bg-yellow-50/50")}>
                      <td className="px-4 py-3 font-medium">{check.tenant?.full_name || "—"}</td>
                      <td className="px-4 py-3" dir="ltr">{check.check_number}</td>
                      <td className="px-4 py-3 text-muted">{check.bank_name || "—"}</td>
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
                        <div className="flex gap-2 items-center">
                          {check.status === "pending" && (
                            <button
                              onClick={() => updateStatus.mutate({ id: check.id, status: "deposited" })}
                              className="text-xs text-primary font-medium hover:underline"
                            >
                              סמן הופקד
                            </button>
                          )}
                          {(check.status === "pending" || check.status === "deposited") && (
                            <button
                              onClick={() => setBounceTarget(check)}
                              className="text-xs text-danger font-medium hover:underline"
                            >
                              צ'ק חוזר
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(check)}
                            className="p-1 rounded hover:bg-gray-100 text-muted"
                            aria-label="ערוך צ'ק"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(check)}
                            className="p-1 rounded hover:bg-red-50 text-danger"
                            aria-label="מחק צ'ק"
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

      <CheckFormModal isOpen={formOpen} onClose={() => setFormOpen(false)} check={editing} />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
        title="מחיקת צ'ק"
        message={
          deleteTarget
            ? deleteError || `למחוק את צ'ק ${deleteTarget.check_number}? הפעולה אינה הפיכה.`
            : ""
        }
        variant="danger"
        confirmText="מחק"
        isLoading={deleteMut.isPending}
      />
      <ConfirmDialog
        isOpen={!!bounceTarget}
        onClose={() => setBounceTarget(null)}
        onConfirm={confirmBounce}
        title="צ'ק חוזר"
        message={
          bounceTarget
            ? `לסמן את הצ'ק עבור ${formatMonthYear(bounceTarget.for_month)} כצ'ק חוזר?`
            : ""
        }
        variant="danger"
        confirmText="סמן כחוזר"
        isLoading={bounceCheck.isPending}
      />
    </div>
  );
}
