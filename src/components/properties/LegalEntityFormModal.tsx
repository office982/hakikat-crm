"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  useCreateLegalEntity,
  useUpdateLegalEntity,
  type LegalEntityInput,
} from "@/hooks/useProperties";
import type { LegalEntity } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  entity?: LegalEntity | null;
}

const TYPE_OPTIONS = [
  { value: "company", label: "חברה" },
  { value: "personal", label: "פרטי" },
];

const EMPTY: LegalEntityInput = {
  name: "",
  type: "company",
  tax_id: "",
  landlord_name: "",
};

export function LegalEntityFormModal({ isOpen, onClose, entity }: Props) {
  const [form, setForm] = useState<LegalEntityInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const createMut = useCreateLegalEntity();
  const updateMut = useUpdateLegalEntity();

  useEffect(() => {
    if (entity) {
      setForm({
        name: entity.name,
        type: entity.type,
        tax_id: entity.tax_id ?? "",
        landlord_name: entity.landlord_name ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [entity, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("שם ישות חובה.");
      return;
    }
    try {
      if (entity) {
        await updateMut.mutateAsync({ id: entity.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={entity ? "עריכת ישות משפטית" : "ישות משפטית חדשה"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="שם"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="למשל: חקיקת נכסים"
        />
        <Select
          label="סוג"
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value as LegalEntityInput["type"] })}
          options={TYPE_OPTIONS}
        />
        <Input
          label="ח״פ / ת״ז"
          value={form.tax_id ?? ""}
          onChange={(e) => setForm({ ...form, tax_id: e.target.value })}
        />
        <Input
          label="שם בעלים (לחוזה)"
          value={form.landlord_name ?? ""}
          onChange={(e) => setForm({ ...form, landlord_name: e.target.value })}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {entity ? "שמור שינויים" : "צור ישות"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
