"use client";

import { Select } from "@/components/ui/Select";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

// Entities matching the DB
const entities = [
  { value: "e1", label: "חקיקת נכסים" },
  { value: "e1b", label: "חקיקת פרטי" },
  { value: "e2", label: 'שיא הכרמל מדור בע"מ' },
  { value: "e3", label: 'נכסי המושבה בע"מ' },
];

const complexesByEntity: Record<string, { value: string; label: string }[]> = {
  e1: [
    { value: "c1", label: "מתחם החקלאי" },
    { value: "c2", label: "רמז" },
    { value: "c3", label: "תבורי" },
  ],
  e1b: [
    { value: "c1", label: "מתחם החקלאי" },
    { value: "c2", label: "רמז" },
    { value: "c3", label: "תבורי" },
  ],
  e2: [{ value: "c4", label: "הרצל 48 גן טיול" }],
  e3: [{ value: "c5", label: "הדקלים 123 פרדס חנה" }],
};

const propertiesByComplex: Record<string, { value: string; label: string }[]> = {
  c1: [
    { value: "p1", label: "כלבייה 1" },
    { value: "p2", label: "כלבייה 2" },
    { value: "p3", label: "אורוות האמנים" },
  ],
  c2: [
    { value: "p4", label: "הזמיר 27" },
    { value: "p5", label: "האשכולית" },
  ],
  c3: [
    { value: "p6", label: "דירה עמית" },
    { value: "p7", label: "דירה עידו" },
  ],
  c4: [{ value: "p8", label: "הרצל 48" }],
  c5: [{ value: "p9", label: "הדקלים 123" }],
};

const unitsByProperty: Record<string, { value: string; label: string }[]> = {
  p1: Array.from({ length: 14 }, (_, i) => ({ value: `u${i + 1}`, label: `חנות ${i + 1}` })),
  p2: Array.from({ length: 16 }, (_, i) => ({ value: `u${i + 15}`, label: `חנות ${i + 15}` })),
  p3: [{ value: "u31", label: "אורוות האמנים" }],
  p4: [
    { value: "u32", label: "דירה קטנה" },
    { value: "u33", label: "דירה גדולה" },
  ],
  p5: [{ value: "u34", label: "האשכולית" }],
  p6: [{ value: "u35", label: "דירה עמית" }],
  p7: [{ value: "u36", label: "דירה עידו" }],
  p8: [
    { value: "u37", label: "דירה 1" },
    { value: "u38", label: "דירה 3" },
    { value: "u39", label: "דירה 5" },
    { value: "u40", label: "דירה 7" },
  ],
  p9: [{ value: "u41", label: "הדקלים 123" }],
};

export function Step2Unit({ data, onChange }: Props) {
  const complexes = data.legal_entity_id ? complexesByEntity[data.legal_entity_id] || [] : [];
  const properties = data.complex_id ? propertiesByComplex[data.complex_id] || [] : [];
  const units = data.property_id ? unitsByProperty[data.property_id] || [] : [];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">שלב 2 — בחירת יחידה</h2>
      <p className="text-sm text-muted mb-4">בחר ישות משפטית → מתחם → נכס → יחידה</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="ישות משפטית *"
          options={entities}
          value={data.legal_entity_id}
          placeholder="בחר ישות..."
          onChange={(e) => {
            const opt = entities.find((o) => o.value === e.target.value);
            onChange({
              legal_entity_id: e.target.value,
              entity_name: opt?.label || "",
              complex_id: "",
              complex_name: "",
              property_id: "",
              property_name: "",
              unit_id: "",
              unit_name: "",
            });
          }}
        />
        <Select
          label="מתחם *"
          options={complexes}
          value={data.complex_id}
          placeholder="בחר מתחם..."
          disabled={!data.legal_entity_id}
          onChange={(e) => {
            const opt = complexes.find((o) => o.value === e.target.value);
            onChange({
              complex_id: e.target.value,
              complex_name: opt?.label || "",
              property_id: "",
              property_name: "",
              unit_id: "",
              unit_name: "",
            });
          }}
        />
        <Select
          label="נכס *"
          options={properties}
          value={data.property_id}
          placeholder="בחר נכס..."
          disabled={!data.complex_id}
          onChange={(e) => {
            const opt = properties.find((o) => o.value === e.target.value);
            onChange({
              property_id: e.target.value,
              property_name: opt?.label || "",
              unit_id: "",
              unit_name: "",
            });
          }}
        />
        <Select
          label="יחידה *"
          options={units}
          value={data.unit_id}
          placeholder="בחר יחידה..."
          disabled={!data.property_id}
          onChange={(e) => {
            const opt = units.find((o) => o.value === e.target.value);
            onChange({
              unit_id: e.target.value,
              unit_name: opt?.label || "",
            });
          }}
        />
      </div>

      {data.unit_name && (
        <div className="mt-4 p-4 bg-accent rounded-lg text-sm">
          <p className="font-medium text-primary">נבחרה יחידה:</p>
          <p>{data.entity_name} → {data.complex_name} → {data.property_name} → {data.unit_name}</p>
        </div>
      )}
    </div>
  );
}
