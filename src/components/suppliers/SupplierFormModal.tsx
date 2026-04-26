"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  useCreateSupplier,
  useUpdateSupplier,
  type SupplierInput,
} from "@/hooks/useSuppliers";
import type { Supplier } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  supplier?: Supplier | null;
}

const EMPTY: SupplierInput = { name: "", phone: "", email: "", notes: "" };

export function SupplierFormModal({ isOpen, onClose, supplier }: Props) {
  const [form, setForm] = useState<SupplierInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const createMut = useCreateSupplier();
  const updateMut = useUpdateSupplier();

  useEffect(() => {
    if (supplier) {
      setForm({
        name: supplier.name,
        phone: supplier.phone ?? "",
        email: supplier.email ?? "",
        notes: supplier.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [supplier, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("שם ספק חובה.");
      return;
    }
    try {
      if (supplier) {
        await updateMut.mutateAsync({ id: supplier.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={supplier ? "עריכת ספק" : "ספק חדש"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="שם ספק"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="למשל: יוסי בטונים"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="טלפון"
            value={form.phone ?? ""}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <Input
            label="דוא״ל"
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <Input
          label="הערות"
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {supplier ? "שמור שינויים" : "צור ספק"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
