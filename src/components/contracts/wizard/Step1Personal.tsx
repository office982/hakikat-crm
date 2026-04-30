"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { useTenants } from "@/hooks/useTenants";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

export function Step1Personal({ data, onChange }: Props) {
  const { data: tenants, isLoading } = useTenants();

  const tenantOptions = useMemo(() => {
    if (!tenants) return [];
    return tenants.map((t) => ({
      value: t.id,
      label: `${t.full_name}${t.id_number ? ` · ${t.id_number}` : ""}`,
    }));
  }, [tenants]);

  const isExisting = !!data.tenant_id;

  const handleSelectTenant = (id: string) => {
    if (!id) {
      onChange({
        tenant_id: undefined,
        full_name: "",
        id_number: "",
        phone: "",
        whatsapp: "",
        email: "",
      });
      return;
    }
    const t = tenants?.find((x) => x.id === id);
    if (!t) return;
    onChange({
      tenant_id: t.id,
      full_name: t.full_name || "",
      id_number: t.id_number || "",
      phone: t.phone || "",
      whatsapp: t.whatsapp || "",
      email: t.email || "",
    });
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">שלב 1 — פרטי דייר</h2>

      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label="בחר דייר קיים"
              value={data.tenant_id || ""}
              onChange={(e) => handleSelectTenant(e.target.value)}
              options={tenantOptions}
              placeholder={isLoading ? "טוען..." : "— דייר חדש —"}
            />
          </div>
          {isExisting && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => handleSelectTenant("")}
            >
              נקה
            </Button>
          )}
        </div>
        <p className="text-xs text-muted">
          {isExisting
            ? "פרטי הדייר נטענו מהמערכת. ניתן לעבור לשלב הבא."
            : "בחר דייר קיים מהרשימה, או מלא פרטים ליצירת דייר חדש."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="שם מלא *"
          value={data.full_name}
          onChange={(e) => onChange({ full_name: e.target.value })}
          placeholder="שם מלא של הדייר"
          required
          readOnly={isExisting}
          className={isExisting ? "bg-gray-50" : ""}
        />
        <Input
          label="תעודת זהות *"
          value={data.id_number}
          onChange={(e) => onChange({ id_number: e.target.value })}
          placeholder="מספר ת.ז"
          required
          readOnly={isExisting}
          className={isExisting ? "bg-gray-50" : ""}
        />
        <Input
          label="טלפון *"
          value={data.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="050-0000000"
          dir="ltr"
          required
          readOnly={isExisting}
          className={isExisting ? "bg-gray-50" : ""}
        />
        <Input
          label="WhatsApp"
          value={data.whatsapp}
          onChange={(e) => onChange({ whatsapp: e.target.value })}
          placeholder="050-0000000"
          dir="ltr"
          readOnly={isExisting}
          className={isExisting ? "bg-gray-50" : ""}
        />
        <Input
          label="אימייל"
          value={data.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="email@example.com"
          type="email"
          dir="ltr"
          className={`md:col-span-2 ${isExisting ? "bg-gray-50" : ""}`}
          readOnly={isExisting}
        />
      </div>
    </div>
  );
}
