"use client";

import { Input } from "@/components/ui/Input";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

export function Step1Personal({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">שלב 1 — פרטי דייר</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="שם מלא *"
          value={data.full_name}
          onChange={(e) => onChange({ full_name: e.target.value })}
          placeholder="שם מלא של הדייר"
          required
        />
        <Input
          label="תעודת זהות *"
          value={data.id_number}
          onChange={(e) => onChange({ id_number: e.target.value })}
          placeholder="מספר ת.ז"
          required
        />
        <Input
          label="טלפון *"
          value={data.phone}
          onChange={(e) => onChange({ phone: e.target.value })}
          placeholder="050-0000000"
          dir="ltr"
          required
        />
        <Input
          label="WhatsApp"
          value={data.whatsapp}
          onChange={(e) => onChange({ whatsapp: e.target.value })}
          placeholder="050-0000000"
          dir="ltr"
        />
        <Input
          label="אימייל"
          value={data.email}
          onChange={(e) => onChange({ email: e.target.value })}
          placeholder="email@example.com"
          type="email"
          dir="ltr"
          className="md:col-span-2"
        />
      </div>
    </div>
  );
}
