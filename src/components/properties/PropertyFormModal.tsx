"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import {
  useLegalEntities,
  useComplexes,
  useCreateProperty,
  useUpdateProperty,
  type PropertyInput,
} from "@/hooks/useProperties";
import type { Property } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  property?: Property | null;
  defaultComplexId?: string;
}

const PROPERTY_TYPE_OPTIONS = [
  { value: "residential", label: "מגורים" },
  { value: "commercial", label: "עסקי" },
  { value: "mixed", label: "מעורב" },
];

const EMPTY: PropertyInput = {
  name: "",
  complex_id: "",
  legal_entity_id: "",
  secondary_legal_entity_id: null,
  dual_entity: false,
  address: "",
  city: "",
  property_type: "residential",
  suggested_rent: null,
};

export function PropertyFormModal({ isOpen, onClose, property, defaultComplexId }: Props) {
  const [form, setForm] = useState<PropertyInput>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const { data: entities = [] } = useLegalEntities();
  const { data: complexes = [] } = useComplexes();
  const createMut = useCreateProperty();
  const updateMut = useUpdateProperty();

  useEffect(() => {
    if (property) {
      setForm({
        name: property.name,
        complex_id: property.complex_id,
        legal_entity_id: property.legal_entity_id,
        secondary_legal_entity_id: property.secondary_legal_entity_id,
        dual_entity: property.dual_entity,
        address: property.address ?? "",
        city: property.city ?? "",
        property_type: property.property_type,
        suggested_rent: property.suggested_rent,
      });
    } else {
      // Auto-pick legal entity from default complex if provided
      const defaultComplex = defaultComplexId
        ? complexes.find((c) => c.id === defaultComplexId)
        : undefined;
      setForm({
        ...EMPTY,
        complex_id: defaultComplexId ?? "",
        legal_entity_id: defaultComplex?.legal_entity_id ?? "",
      });
    }
    setError(null);
  }, [property, defaultComplexId, isOpen, complexes]);

  // Auto-set legal_entity_id when complex changes (for new only)
  useEffect(() => {
    if (!property && form.complex_id) {
      const c = complexes.find((c) => c.id === form.complex_id);
      if (c && c.legal_entity_id !== form.legal_entity_id) {
        setForm((f) => ({ ...f, legal_entity_id: c.legal_entity_id }));
      }
    }
  }, [form.complex_id, complexes, property]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("שם נכס חובה.");
      return;
    }
    if (!form.complex_id) {
      setError("יש לבחור מתחם.");
      return;
    }
    if (!form.legal_entity_id) {
      setError("יש לבחור ישות משפטית.");
      return;
    }
    try {
      if (property) {
        await updateMut.mutateAsync({ id: property.id, ...form });
      } else {
        await createMut.mutateAsync(form);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={property ? "עריכת נכס" : "נכס חדש"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="שם נכס"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="למשל: כלבייה 1"
        />
        <Select
          label="מתחם"
          placeholder="בחר מתחם"
          value={form.complex_id}
          onChange={(e) => setForm({ ...form, complex_id: e.target.value })}
          options={complexes.map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label="ישות משפטית"
          placeholder="בחר ישות"
          value={form.legal_entity_id}
          onChange={(e) => setForm({ ...form, legal_entity_id: e.target.value })}
          options={entities.map((e) => ({ value: e.id, label: e.name }))}
        />
        <div className="flex items-center gap-2">
          <input
            id="dual_entity"
            type="checkbox"
            checked={form.dual_entity ?? false}
            onChange={(e) => setForm({ ...form, dual_entity: e.target.checked })}
          />
          <label htmlFor="dual_entity" className="text-sm">נכס דו-ישותי (החנות חולקת בין שתי ישויות)</label>
        </div>
        {form.dual_entity && (
          <Select
            label="ישות משפטית משנית"
            placeholder="בחר ישות משנית"
            value={form.secondary_legal_entity_id ?? ""}
            onChange={(e) => setForm({ ...form, secondary_legal_entity_id: e.target.value || null })}
            options={entities.map((e) => ({ value: e.id, label: e.name }))}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
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
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select
            label="סוג נכס"
            value={form.property_type ?? "residential"}
            onChange={(e) => setForm({ ...form, property_type: e.target.value as PropertyInput["property_type"] })}
            options={PROPERTY_TYPE_OPTIONS}
          />
          <Input
            label="מחיר שכירות מוצע (₪)"
            type="number"
            min={0}
            value={form.suggested_rent ?? ""}
            placeholder="לא הוגדר"
            onChange={(e) =>
              setForm({
                ...form,
                suggested_rent: e.target.value ? Number(e.target.value) : null,
              })
            }
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {property ? "שמור שינויים" : "צור נכס"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
