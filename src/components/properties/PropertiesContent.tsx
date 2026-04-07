"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { Building2, Home, Store, ChevronDown, ChevronLeft, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLegalEntities, useComplexes, useProperties, useUnits } from "@/hooks/useProperties";
import { isSupabaseConfigured } from "@/lib/supabase";

export function PropertiesContent() {
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedComplex, setExpandedComplex] = useState<string | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  const { data: entities = [], isLoading: entitiesLoading } = useLegalEntities();
  const { data: complexes = [], isLoading: complexesLoading } = useComplexes();
  const { data: properties = [] } = useProperties();
  const { data: units = [] } = useUnits();

  const isLoading = entitiesLoading || complexesLoading;
  const configured = isSupabaseConfigured();

  if (isLoading && configured) return <PageSpinner />;

  // Filter
  const filteredComplexes = complexes.filter((c) => {
    if (entityFilter && c.legal_entity_id !== entityFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const complexProps = properties.filter((p) => p.complex_id === c.id);
      const complexUnits = units.filter((u) => complexProps.some((p) => p.id === u.property_id));
      const matchComplex = c.name.toLowerCase().includes(s);
      const matchProp = complexProps.some((p) => p.name.toLowerCase().includes(s));
      const matchUnit = complexUnits.some((u) => u.unit_identifier.toLowerCase().includes(s));
      if (!matchComplex && !matchProp && !matchUnit) return false;
    }
    return true;
  });

  // Stats
  const totalUnits = units.length;
  const occupiedUnits = units.filter((u) => u.is_occupied).length;
  const vacantUnits = totalUnits - occupiedUnits;

  const entityOptions = [
    { value: "", label: "כל הישויות" },
    ...entities.map((e) => ({ value: e.id, label: e.name })),
  ];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-50"><Building2 className="w-5 h-5 text-blue-500" /></div>
            <div>
              <p className="text-2xl font-bold">{totalUnits}</p>
              <p className="text-xs text-muted">סה״כ יחידות</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-50"><Home className="w-5 h-5 text-green-500" /></div>
            <div>
              <p className="text-2xl font-bold text-success">{occupiedUnits}</p>
              <p className="text-xs text-muted">מושכרות</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-50"><Store className="w-5 h-5 text-red-500" /></div>
            <div>
              <p className="text-2xl font-bold text-danger">{vacantUnits}</p>
              <p className="text-xs text-muted">פנויות</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex gap-3 flex-wrap">
          <SearchInput value={search} onChange={setSearch} placeholder="חיפוש נכס / יחידה..." className="w-64" />
          <Select options={entityOptions} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="w-52" />
        </div>
      </Card>

      {/* Tree View */}
      {!configured || filteredComplexes.length === 0 ? (
        <EmptyState icon={Building2} title="לא נמצאו נכסים" description={configured ? "נסה לשנות את הסינון" : "חבר Supabase כדי לראות נכסים"} />
      ) : (
        <div className="space-y-3">
          {filteredComplexes.map((complex) => {
            const complexProps = properties.filter((p) => p.complex_id === complex.id);
            const complexUnits = units.filter((u) => complexProps.some((p) => p.id === u.property_id));
            const complexOccupied = complexUnits.filter((u) => u.is_occupied).length;
            const entity = entities.find((e) => e.id === complex.legal_entity_id);
            const isExpanded = expandedComplex === complex.id;

            return (
              <Card key={complex.id} noPadding>
                {/* Complex Header */}
                <button
                  onClick={() => setExpandedComplex(isExpanded ? null : complex.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted" /> : <ChevronLeft className="w-5 h-5 text-muted" />}
                    <Building2 className="w-5 h-5 text-primary" />
                    <div className="text-right">
                      <p className="font-semibold">{complex.name}</p>
                      <p className="text-xs text-muted">{entity?.name} · {complex.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted">{complexProps.length} נכסים</span>
                    <span className="text-sm">
                      <span className="text-success font-medium">{complexOccupied}</span>
                      <span className="text-muted"> / {complexUnits.length}</span>
                    </span>
                  </div>
                </button>

                {/* Properties */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {complexProps.map((prop) => {
                      const propUnits = units.filter((u) => u.property_id === prop.id);
                      const propOccupied = propUnits.filter((u) => u.is_occupied).length;
                      const isPropExpanded = expandedProperty === prop.id;

                      return (
                        <div key={prop.id}>
                          <button
                            onClick={() => setExpandedProperty(isPropExpanded ? null : prop.id)}
                            className="w-full flex items-center justify-between px-4 py-3 pr-12 hover:bg-gray-50 border-b border-border/50"
                          >
                            <div className="flex items-center gap-2">
                              {isPropExpanded ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronLeft className="w-4 h-4 text-muted" />}
                              <span className="font-medium text-sm">{prop.name}</span>
                              {prop.dual_entity && <Badge variant="info">dual</Badge>}
                              <Badge variant={prop.property_type === "commercial" ? "warning" : "default"}>
                                {prop.property_type === "commercial" ? "עסקי" : prop.property_type === "residential" ? "מגורים" : "מעורב"}
                              </Badge>
                            </div>
                            <span className="text-xs text-muted">{propOccupied}/{propUnits.length} מושכרות</span>
                          </button>

                          {/* Units */}
                          {isPropExpanded && (
                            <div className="bg-gray-50/50">
                              {propUnits.map((unit) => (
                                <div key={unit.id} className="flex items-center justify-between px-4 py-2 pr-20 border-b border-border/30 text-sm">
                                  <div className="flex items-center gap-2">
                                    {unit.unit_type === "commercial" ? <Store className="w-3.5 h-3.5 text-muted" /> : <Home className="w-3.5 h-3.5 text-muted" />}
                                    <span>{unit.unit_identifier}</span>
                                  </div>
                                  <Badge variant={unit.is_occupied ? "success" : "danger"}>
                                    {unit.is_occupied ? "מושכר" : "פנוי"}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
