"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  useLegalEntities,
  useCreateComplex,
  useUpdateComplex,
  type ComplexInput,
} from "@/hooks/useProperties";
import type { Complex } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  complex?: Complex | null;
  defaultEntityId?: string;
}

const EMPTY: ComplexInput = {
  name: "",
  legal_entity_id: "",
  address: "",
  city: "",
};

export function ComplexFormModal({ isOpen, onClose, complex, defaultEntityId }: Props) {
  const [form, setForm] = useState<ComplexInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const { data: entities = [] } = useLegalEntities();
  const createMut = useCreateComplex();
  const updateMut = useUpdateComplex();

  useEffect(() => {
    if (complex) {
      setForm({
        name: complex.name,
        legal_entity_id: complex.legal_entity_id,
        address: complex.address ?? "",
        city: complex.city ?? "",
      });
    } else {
      setForm({ ...EMPTY, legal_entity_id: defaultEntityId ?? "" });
    }
    setError(null);
  }, [complex, defaultEntityId, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("שם מתחם חובה.");
      return;
    }
    if (!form.legal_entity_id) {
      setError("יש לבחור ישות משפטית.");
      return;
    }
    try {
      if (complex) {
        await updateMut.mutateAsync({ id: complex.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={complex ? "עריכת מתחם" : "מתחם חדש"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="שם מתחם"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="למשל: מתחם החקלאי"
        />
        <Select
          label="ישות משפטית"
          placeholder="בחר ישות"
          value={form.legal_entity_id}
          onChange={(e) => setForm({ ...form, legal_entity_id: e.target.value })}
          options={entities.map((e) => ({ value: e.id, label: e.name }))}
        />
        <Input
          label="כתובת"
          value={form.address ?? ""}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <Input
          label="עיר"
          value={form.city ?? ""}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {complex ? "שמור שינויים" : "צור מתחם"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
