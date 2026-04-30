"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useCreateTenant, useUpdateTenant } from "@/hooks/useTenants";
import { useUnits } from "@/hooks/useProperties";
import type { Tenant } from "@/types/database";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenant?: Tenant | null;
}

interface TenantForm {
  full_name: string;
  id_number: string;
  phone: string;
  whatsapp: string;
  email: string;
  unit_id: string;
  is_active: boolean;
  notes: string;
}

const EMPTY: TenantForm = {
  full_name: "",
  id_number: "",
  phone: "",
  whatsapp: "",
  email: "",
  unit_id: "",
  is_active: true,
  notes: "",
};

export function TenantFormModal({ isOpen, onClose, tenant }: Props) {
  const [form, setForm] = useState<TenantForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const { data: units = [] } = useUnits();
  const createMut = useCreateTenant();
  const updateMut = useUpdateTenant();

  useEffect(() => {
    if (tenant) {
      setForm({
        full_name: tenant.full_name,
        id_number: tenant.id_number,
        phone: tenant.phone,
        whatsapp: tenant.whatsapp ?? "",
        email: tenant.email ?? "",
        unit_id: tenant.unit_id ?? "",
        is_active: tenant.is_active,
        notes: tenant.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
    setError(null);
  }, [tenant, isOpen]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.full_name.trim()) {
      setError("שם מלא חובה.");
      return;
    }
    if (!form.id_number.trim()) {
      setError("ת.ז חובה.");
      return;
    }
    if (!form.phone.trim()) {
      setError("טלפון חובה.");
      return;
    }
    try {
      const payload = {
        full_name: form.full_name.trim(),
        id_number: form.id_number.trim(),
        phone: form.phone.trim(),
        whatsapp: form.whatsapp.trim() || undefined,
        email: form.email.trim() || undefined,
        unit_id: form.unit_id || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (tenant) {
        await updateMut.mutateAsync({
          id: tenant.id,
          ...payload,
          whatsapp: payload.whatsapp ?? null,
          email: payload.email ?? null,
          unit_id: payload.unit_id ?? null,
          notes: payload.notes ?? null,
          is_active: form.is_active,
        });
      } else {
        await createMut.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שמירה נכשלה.");
    }
  };

  const unitOptions = [
    { value: "", label: "ללא יחידה" },
    ...units.map((u) => ({ value: u.id, label: u.unit_identifier })),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={tenant ? "עריכת דייר" : "דייר חדש"}>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="שם מלא"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          placeholder="שם פרטי ומשפחה"
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="ת.ז"
            value={form.id_number}
            onChange={(e) => setForm({ ...form, id_number: e.target.value })}
            dir="ltr"
          />
          <Input
            label="טלפון"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            dir="ltr"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="וואטסאפ"
            value={form.whatsapp}
            onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            placeholder="ברירת מחדל: טלפון"
            dir="ltr"
          />
          <Input
            label="דוא״ל"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            dir="ltr"
          />
        </div>
        <Select
          label="יחידה"
          value={form.unit_id}
          onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
          options={unitOptions}
        />
        <Input
          label="הערות"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {tenant && (
          <div className="flex items-center gap-2">
            <input
              id="tenant_active"
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <label htmlFor="tenant_active" className="text-sm">
              דייר פעיל
            </label>
          </div>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            ביטול
          </Button>
          <Button type="submit" isLoading={createMut.isPending || updateMut.isPending}>
            {tenant ? "שמור שינויים" : "צור דייר"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
