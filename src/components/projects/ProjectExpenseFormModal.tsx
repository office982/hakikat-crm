"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  useCreateProjectExpense,
  useUpdateProjectExpense,
  type ProjectExpenseInput,
} from "@/hooks/useProjects";
import { useSuppliers } from "@/hooks/useSuppliers";
import type { ProjectExpense } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  expense?: ProjectExpense | null;
}

const STATUS_OPTIONS = [
  { value: "unpaid", label: "לא שולם" },
  { value: "paid", label: "שולם" },
  { value: "partial", label: "חלקי" },
];

export function ProjectExpenseFormModal({ isOpen, onClose, projectId, expense }: Props) {
  const [form, setForm] = useState<ProjectExpenseInput>({
    project_id: projectId,
    supplier_id: null,
    supplier_name: "",
    description: "",
    amount: 0,
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: null,
    status: "unpaid",
    invoice_number: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const { data: suppliers = [] } = useSuppliers();
  const createMut = useCreateProjectExpense();
  const updateMut = useUpdateProjectExpense();

  useEffect(() => {
    if (expense) {
      setForm({
        project_id: expense.project_id,
        supplier_id: expense.supplier_id,
        supplier_name: expense.supplier_name ?? "",
        description: expense.description ?? "",
        amount: expense.amount,
        invoice_date: expense.invoice_date ?? new Date().toISOString().split("T")[0],
        due_date: expense.due_date,
        status: expense.status,
        invoice_number: expense.invoice_number ?? "",
        notes: expense.notes ?? "",
      });
    } else {
      setForm({
        project_id: projectId,
        supplier_id: null,
        supplier_name: "",
        description: "",
        amount: 0,
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: null,
        status: "unpaid",
        invoice_number: "",
        notes: "",
      });
    }
    setError(null);
  }, [expense, projectId, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.amount || form.amount <= 0) {
      setError("חובה להזין סכום חיובי.");
      return;
    }
    if (!form.supplier_id && !form.supplier_name?.trim()) {
      setError("בחר ספק קיים או הזן שם ספק חופשי.");
      return;
    }
    try {
      if (expense) {
        await updateMut.mutateAsync({ id: expense.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={expense ? "עריכת הוצאה" : "הוצאה חדשה"}>
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="ספק (אופציונלי — בחר מהרשימה)"
          placeholder="ספק חופשי / לא מהרשימה"
          value={form.supplier_id ?? ""}
          onChange={(e) =>
            setForm({
              ...form,
              supplier_id: e.target.value || null,
              supplier_name: e.target.value
                ? suppliers.find((s) => s.id === e.target.value)?.name || ""
                : form.supplier_name,
            })
          }
          options={suppliers.map((s) => ({ value: s.id, label: s.name }))}
        />
        {!form.supplier_id && (
          <Input
            label="שם ספק"
            value={form.supplier_name ?? ""}
            onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
            placeholder="למשל: יוסי בטונים"
          />
        )}
        <Input
          label="תיאור"
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="למשל: יציקת רצפות"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="סכום (₪)"
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })}
          />
          <Select
            label="סטטוס"
            value={form.status ?? "unpaid"}
            onChange={(e) => setForm({ ...form, status: e.target.value as ProjectExpenseInput["status"] })}
            options={STATUS_OPTIONS}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תאריך חשבונית"
            type="date"
            value={form.invoice_date ?? ""}
            onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
          />
          <Input
            label="תאריך פירעון"
            type="date"
            value={form.due_date ?? ""}
            onChange={(e) => setForm({ ...form, due_date: e.target.value || null })}
          />
        </div>
        <Input
          label="מספר חשבונית"
          value={form.invoice_number ?? ""}
          onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {expense ? "שמור שינויים" : "צור הוצאה"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
