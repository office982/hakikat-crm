"use client";

import { Select } from "@/components/ui/Select";
import { useLegalEntities, useComplexes, useProperties, useUnits } from "@/hooks/useProperties";
import type { ContractFormData } from "../ContractWizard";

interface Props {
  data: ContractFormData;
  onChange: (partial: Partial<ContractFormData>) => void;
}

export function Step2Unit({ data, onChange }: Props) {
  const { data: entities = [], isLoading: loadingEntities } = useLegalEntities();
  const { data: complexes = [], isLoading: loadingComplexes } = useComplexes(data.legal_entity_id || undefined);
  const { data: properties = [], isLoading: loadingProperties } = useProperties(data.complex_id || undefined);
  const { data: units = [], isLoading: loadingUnits } = useUnits(data.property_id || undefined);

  const entityOptions = entities.map((e) => ({ value: e.id, label: e.name }));
  const complexOptions = complexes.map((c) => ({ value: c.id, label: c.name }));
  const propertyOptions = properties.map((p) => ({ value: p.id, label: p.name }));
  const unitOptions = units.map((u) => ({ value: u.id, label: u.unit_identifier }));

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold mb-4">שלב 2 — בחירת יחידה</h2>
      <p className="text-sm text-muted mb-4">בחר ישות משפטית → מתחם → נכס → יחידה</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Select
          label="ישות משפטית *"
          options={entityOptions}
          value={data.legal_entity_id}
          placeholder={loadingEntities ? "טוען..." : "בחר ישות..."}
          disabled={loadingEntities}
          onChange={(e) => {
            const opt = entities.find((o) => o.id === e.target.value);
            onChange({
              legal_entity_id: e.target.value,
              entity_name: opt?.name || "",
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
          options={complexOptions}
          value={data.complex_id}
          placeholder={loadingComplexes ? "טוען..." : "בחר מתחם..."}
          disabled={!data.legal_entity_id || loadingComplexes}
          onChange={(e) => {
            const opt = complexes.find((o) => o.id === e.target.value);
            onChange({
              complex_id: e.target.value,
              complex_name: opt?.name || "",
              property_id: "",
              property_name: "",
              unit_id: "",
              unit_name: "",
            });
          }}
        />
        <Select
          label="נכס *"
          options={propertyOptions}
          value={data.property_id}
          placeholder={loadingProperties ? "טוען..." : "בחר נכס..."}
          disabled={!data.complex_id || loadingProperties}
          onChange={(e) => {
            const opt = properties.find((o) => o.id === e.target.value);
            onChange({
              property_id: e.target.value,
              property_name: opt?.name || "",
              unit_id: "",
              unit_name: "",
            });
          }}
        />
        <Select
          label="יחידה *"
          options={unitOptions}
          value={data.unit_id}
          placeholder={loadingUnits ? "טוען..." : "בחר יחידה..."}
          disabled={!data.property_id || loadingUnits}
          onChange={(e) => {
            const opt = units.find((o) => o.id === e.target.value);
            onChange({
              unit_id: e.target.value,
              unit_name: opt?.unit_identifier || "",
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
