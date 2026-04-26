"use client";
import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  useProperties,
  useCreateUnit,
  useUpdateUnit,
  type UnitInput,
} from "@/hooks/useProperties";
import type { Unit } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  unit?: Unit | null;
  defaultPropertyId?: string;
}

const UNIT_TYPE_OPTIONS = [
  { value: "residential", label: "מגורים" },
  { value: "commercial", label: "עסקי" },
];

const EMPTY: UnitInput = {
  property_id: "",
  unit_identifier: "",
  unit_type: "residential",
  floor: null,
  size_sqm: null,
  notes: "",
  is_occupied: false,
};

export function UnitFormModal({ isOpen, onClose, unit, defaultPropertyId }: Props) {
  const [form, setForm] = useState<UnitInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const { data: properties = [] } = useProperties();
  const createMut = useCreateUnit();
  const updateMut = useUpdateUnit();

  useEffect(() => {
    if (unit) {
      setForm({
        property_id: unit.property_id,
        unit_identifier: unit.unit_identifier,
        unit_type: unit.unit_type,
        floor: unit.floor,
        size_sqm: unit.size_sqm,
        notes: unit.notes ?? "",
        is_occupied: unit.is_occupied,
      });
    } else {
      setForm({ ...EMPTY, property_id: defaultPropertyId ?? "" });
    }
    setError(null);
  }, [unit, defaultPropertyId, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.unit_identifier.trim()) {
      setError("מזהה יחידה חובה.");
      return;
    }
    if (!form.property_id) {
      setError("יש לבחור נכס.");
      return;
    }
    try {
      if (unit) {
        await updateMut.mutateAsync({ id: unit.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={unit ? "עריכת יחידה" : "יחידה חדשה"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="מזהה יחידה"
          value={form.unit_identifier}
          onChange={(e) => setForm({ ...form, unit_identifier: e.target.value })}
          placeholder="למשל: חנות 5"
        />
        <Select
          label="נכס"
          placeholder="בחר נכס"
          value={form.property_id}
          onChange={(e) => setForm({ ...form, property_id: e.target.value })}
          options={properties.map((p) => ({ value: p.id, label: p.name }))}
        />
        <Select
          label="סוג יחידה"
          value={form.unit_type}
          onChange={(e) => setForm({ ...form, unit_type: e.target.value as UnitInput["unit_type"] })}
          options={UNIT_TYPE_OPTIONS}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="קומה"
            type="number"
            value={form.floor ?? ""}
            onChange={(e) =>
              setForm({ ...form, floor: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
          <Input
            label="גודל (מ״ר)"
            type="number"
            min={0}
            value={form.size_sqm ?? ""}
            onChange={(e) =>
              setForm({ ...form, size_sqm: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <Input
          label="הערות"
          value={form.notes ?? ""}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        <div className="flex items-center gap-2">
          <input
            id="is_occupied"
            type="checkbox"
            checked={form.is_occupied ?? false}
            onChange={(e) => setForm({ ...form, is_occupied: e.target.checked })}
          />
          <label htmlFor="is_occupied" className="text-sm">היחידה מאוכלסת</label>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {unit ? "שמור שינויים" : "צור יחידה"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
