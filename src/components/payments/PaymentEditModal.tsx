"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useUpdatePayment } from "@/hooks/usePayments";
import type { Payment } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  payment: Payment | null;
}

const METHOD_OPTIONS = [
  { value: "check", label: "צ׳ק" },
  { value: "transfer", label: "העברה בנקאית" },
  { value: "cash", label: "מזומן" },
];

interface PaymentEditForm {
  amount: number;
  payment_date: string;
  month_paid_for: string;
  payment_method: "check" | "transfer" | "cash";
  check_number: string;
  check_bank: string;
  check_date: string;
  notes: string;
}

export function PaymentEditModal({ isOpen, onClose, payment }: Props) {
  const updateMut = useUpdatePayment();
  const [form, setForm] = useState<PaymentEditForm>({
    amount: 0,
    payment_date: "",
    month_paid_for: "",
    payment_method: "check",
    check_number: "",
    check_bank: "",
    check_date: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (payment) {
      setForm({
        amount: payment.amount,
        payment_date: payment.payment_date,
        month_paid_for: payment.month_paid_for,
        payment_method: payment.payment_method,
        check_number: payment.check_number ?? "",
        check_bank: payment.check_bank ?? "",
        check_date: payment.check_date ?? "",
        notes: payment.notes ?? "",
      });
    }
    setError(null);
  }, [payment, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payment) return;
    setError(null);
    try {
      await updateMut.mutateAsync({
        id: payment.id,
        amount: form.amount,
        payment_date: form.payment_date,
        month_paid_for: form.month_paid_for,
        payment_method: form.payment_method,
        check_number: form.payment_method === "check" ? form.check_number || null : null,
        check_bank: form.payment_method === "check" ? form.check_bank || null : null,
        check_date: form.payment_method === "check" ? form.check_date || null : null,
        notes: form.notes.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="עריכת תשלום" size="lg">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="סכום (₪)"
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
          />
          <Input
            label="עבור חודש (MM/YYYY)"
            value={form.month_paid_for}
            onChange={(e) => setForm({ ...form, month_paid_for: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="תאריך תשלום"
            type="date"
            value={form.payment_date}
            onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
          />
          <Select
            label="אמצעי תשלום"
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentEditForm["payment_method"] })}
            options={METHOD_OPTIONS}
          />
        </div>
        {form.payment_method === "check" && (
          <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50 rounded-lg">
            <Input
              label="מספר צ׳ק"
              value={form.check_number}
              onChange={(e) => setForm({ ...form, check_number: e.target.value })}
              dir="ltr"
            />
            <Input
              label="בנק"
              value={form.check_bank}
              onChange={(e) => setForm({ ...form, check_bank: e.target.value })}
            />
            <Input
              label="תאריך פירעון"
              type="date"
              value={form.check_date}
              onChange={(e) => setForm({ ...form, check_date: e.target.value })}
            />
          </div>
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
          <Button type="submit" isLoading={updateMut.isPending}>
            שמור שינויים
          </Button>
        </div>
      </form>
    </Modal>
  );
}
