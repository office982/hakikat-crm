"use client";

import { useState, useEffect, useMemo } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useCreateCheck, useUpdateCheck } from "@/hooks/useChecks";
import { useTenants } from "@/hooks/useTenants";
import type { Check } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  check?: Check | null;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "ממתין" },
  { value: "deposited", label: "הופקד" },
  { value: "bounced", label: "חזר" },
  { value: "cancelled", label: "מבוטל" },
];

interface CheckForm {
  tenant_id: string;
  contract_id: string;
  check_number: string;
  bank_name: string;
  branch_number: string;
  account_number: string;
  amount: number;
  due_date: string;
  for_month: string;
  status: "pending" | "deposited" | "bounced" | "cancelled";
  notes: string;
}

const EMPTY: CheckForm = {
  tenant_id: "",
  contract_id: "",
  check_number: "",
  bank_name: "",
  branch_number: "",
  account_number: "",
  amount: 0,
  due_date: "",
  for_month: "",
  status: "pending",
  notes: "",
};

export function CheckFormModal({ isOpen, onClose, check }: Props) {
  const [form, setForm] = useState<CheckForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const { data: tenants = [] } = useTenants();
  const createMut = useCreateCheck();
  const updateMut = useUpdateCheck();

  useEffect(() => {
    if (check) {
      setForm({
        tenant_id: check.tenant_id,
        contract_id: check.contract_id,
        check_number: check.check_number,
        bank_name: check.bank_name ?? "",
        branch_number: check.branch_number ?? "",
        account_number: check.account_number ?? "",
        amount: check.amount,
        due_date: check.due_date,
        for_month: check.for_month,
        status: check.status,
        notes: check.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [check, isOpen]);

  const tenantOptions = useMemo(
    () => [
      { value: "", label: "בחר דייר" },
      ...tenants.map((t) => ({ value: t.id, label: t.full_name })),
    ],
    [tenants]
  );

  // Resolve active contract for the chosen tenant (creating only)
  const selectedTenant = tenants.find((t) => t.id === form.tenant_id);
  const activeContract = selectedTenant?.contracts?.find((c) => c.status === "active") || selectedTenant?.contracts?.[0];

  useEffect(() => {
    if (!check && activeContract && form.contract_id !== activeContract.id) {
      setForm((f) => ({ ...f, contract_id: activeContract.id }));
    }
  }, [activeContract, check, form.contract_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.tenant_id) return setError("יש לבחור דייר.");
    if (!form.contract_id) return setError("לא נמצא חוזה פעיל לדייר זה.");
    if (!form.check_number.trim()) return setError("מספר צ'ק חובה.");
    if (!form.amount || form.amount <= 0) return setError("יש להזין סכום חיובי.");
    if (!form.due_date) return setError("תאריך פירעון חובה.");
    if (!form.for_month.trim()) return setError("חודש הצ'ק חובה (MM/YYYY).");

    try {
      if (check) {
        await updateMut.mutateAsync({
          id: check.id,
          check_number: form.check_number,
          bank_name: form.bank_name || null,
          branch_number: form.branch_number || null,
          account_number: form.account_number || null,
          amount: form.amount,
          due_date: form.due_date,
          for_month: form.for_month,
          status: form.status,
          notes: form.notes || null,
        });
      } else {
        await createMut.mutateAsync({
          tenant_id: form.tenant_id,
          contract_id: form.contract_id,
          check_number: form.check_number,
          bank_name: form.bank_name || undefined,
          branch_number: form.branch_number || undefined,
          account_number: form.account_number || undefined,
          amount: form.amount,
          due_date: form.due_date,
          for_month: form.for_month,
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={check ? "עריכת צ'ק" : "צ'ק חדש"} size="lg">
      <form onSubmit={submit} className="space-y-4">
        <Select
          label="דייר"
          value={form.tenant_id}
          onChange={(e) => setForm({ ...form, tenant_id: e.target.value, contract_id: "" })}
          options={tenantOptions}
          disabled={!!check}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="מספר צ'ק"
            value={form.check_number}
            onChange={(e) => setForm({ ...form, check_number: e.target.value })}
            dir="ltr"
          />
          <Input
            label="סכום (₪)"
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תאריך פירעון"
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
          <Input
            label="עבור חודש (MM/YYYY)"
            value={form.for_month}
            onChange={(e) => setForm({ ...form, for_month: e.target.value })}
            placeholder="04/2026"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="בנק"
            value={form.bank_name}
            onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
          />
          <Input
            label="סניף"
            value={form.branch_number}
            onChange={(e) => setForm({ ...form, branch_number: e.target.value })}
            dir="ltr"
          />
          <Input
            label="חשבון"
            value={form.account_number}
            onChange={(e) => setForm({ ...form, account_number: e.target.value })}
            dir="ltr"
          />
        </div>
        {check && (
          <Select
            label="סטטוס"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as CheckForm["status"] })}
            options={STATUS_OPTIONS}
          />
        )}
        <Input
          label="הערות"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {check ? "שמור שינויים" : "צור צ'ק"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
