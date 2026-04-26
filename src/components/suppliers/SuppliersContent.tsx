"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Plus, Pencil, Trash2, Truck } from "lucide-react";
import { useSuppliers, useDeleteSupplier } from "@/hooks/useSuppliers";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { Supplier } from "@/types/database";
import { SupplierFormModal } from "./SupplierFormModal";

export function SuppliersContent() {
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: suppliers = [], isLoading } = useSuppliers();
  const deleteMut = useDeleteSupplier();
  const configured = isSupabaseConfigured();

  if (isLoading && configured) return <PageSpinner />;

  const filtered = suppliers.filter((s) =>
    !search ? true : s.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (s: Supplier) => {
    setEditing(s);
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

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex gap-3 flex-wrap items-end justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="חיפוש ספק..." className="w-64" />
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" />ספק חדש
          </Button>
        </div>
      </Card>

      {!configured || filtered.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="לא נמצאו ספקים"
          description={configured ? "נסה לחפש שם אחר, או הוסף ספק חדש" : "חבר Supabase כדי לראות ספקים"}
        />
      ) : (
        <Card noPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-gray-50">
                  <th className="text-right px-4 py-3 font-medium text-muted">שם</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">טלפון</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden md:table-cell">דוא״ל</th>
                  <th className="text-right px-4 py-3 font-medium text-muted hidden lg:table-cell">הערות</th>
                  <th className="text-right px-4 py-3 font-medium text-muted">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell" dir="ltr">{s.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted hidden md:table-cell" dir="ltr">{s.email || "—"}</td>
                    <td className="px-4 py-3 text-muted hidden lg:table-cell">{s.notes || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1 rounded hover:bg-gray-100 text-muted"
                          aria-label="ערוך"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="p-1 rounded hover:bg-red-50 text-danger"
                          aria-label="מחק"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SupplierFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        supplier={editing}
      />
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
        title="מחיקת ספק"
        message={
          deleteTarget
            ? deleteError || `למחוק את הספק "${deleteTarget.name}"? הפעולה אינה הפיכה.`
            : ""
        }
        variant="danger"
        confirmText="מחק"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
