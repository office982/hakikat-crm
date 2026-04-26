"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SearchInput } from "@/components/ui/SearchInput";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageSpinner } from "@/components/ui/Spinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  Building2,
  Home,
  Store,
  ChevronDown,
  ChevronLeft,
  Plus,
  Pencil,
  Trash2,
  Briefcase,
} from "lucide-react";
import {
  useLegalEntities,
  useComplexes,
  useProperties,
  useUnits,
  useDeleteLegalEntity,
  useDeleteComplex,
  useDeleteProperty,
  useDeleteUnit,
} from "@/hooks/useProperties";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { LegalEntity, Complex, Property, Unit } from "@/types/database";
import { LegalEntityFormModal } from "./LegalEntityFormModal";
import { ComplexFormModal } from "./ComplexFormModal";
import { PropertyFormModal } from "./PropertyFormModal";
import { UnitFormModal } from "./UnitFormModal";
import { OccupancyMap } from "./OccupancyMap";
import { formatCurrency } from "@/lib/utils";

type DeleteTarget =
  | { kind: "entity"; id: string; name: string }
  | { kind: "complex"; id: string; name: string }
  | { kind: "property"; id: string; name: string }
  | { kind: "unit"; id: string; name: string }
  | null;

export function PropertiesContent() {
  const [entityFilter, setEntityFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expandedComplex, setExpandedComplex] = useState<string | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  const [view, setView] = useState<"tree" | "map">("tree");

  // Modal state
  const [entityModal, setEntityModal] = useState<{ open: boolean; entity: LegalEntity | null }>({ open: false, entity: null });
  const [complexModal, setComplexModal] = useState<{ open: boolean; complex: Complex | null; defaultEntityId?: string }>({ open: false, complex: null });
  const [propertyModal, setPropertyModal] = useState<{ open: boolean; property: Property | null; defaultComplexId?: string }>({ open: false, property: null });
  const [unitModal, setUnitModal] = useState<{ open: boolean; unit: Unit | null; defaultPropertyId?: string }>({ open: false, unit: null });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data: entities = [], isLoading: entitiesLoading } = useLegalEntities();
  const { data: complexes = [], isLoading: complexesLoading } = useComplexes();
  const { data: properties = [] } = useProperties();
  const { data: units = [] } = useUnits();

  const delEntity = useDeleteLegalEntity();
  const delComplex = useDeleteComplex();
  const delProperty = useDeleteProperty();
  const delUnit = useDeleteUnit();

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

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      switch (deleteTarget.kind) {
        case "entity": await delEntity.mutateAsync(deleteTarget.id); break;
        case "complex": await delComplex.mutateAsync(deleteTarget.id); break;
        case "property": await delProperty.mutateAsync(deleteTarget.id); break;
        case "unit": await delUnit.mutateAsync(deleteTarget.id); break;
      }
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "מחיקה נכשלה.");
    }
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

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

      {/* Toolbar */}
      <Card>
        <div className="flex gap-3 flex-wrap items-end justify-between">
          <div className="flex gap-3 flex-wrap">
            <SearchInput value={search} onChange={setSearch} placeholder="חיפוש נכס / יחידה..." className="w-64" />
            <Select options={entityOptions} value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="w-52" />
            <div className="flex gap-1 rounded-lg border border-border p-1">
              <button
                onClick={() => setView("tree")}
                className={`px-3 py-1 text-xs rounded ${view === "tree" ? "bg-primary text-white" : "text-muted"}`}
              >
                רשימה
              </button>
              <button
                onClick={() => setView("map")}
                className={`px-3 py-1 text-xs rounded ${view === "map" ? "bg-primary text-white" : "text-muted"}`}
              >
                מפת תפוסה
              </button>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => setEntityModal({ open: true, entity: null })}>
              <Plus className="w-4 h-4" />ישות
            </Button>
            <Button size="sm" variant="outline" onClick={() => setComplexModal({ open: true, complex: null })}>
              <Plus className="w-4 h-4" />מתחם
            </Button>
            <Button size="sm" variant="outline" onClick={() => setPropertyModal({ open: true, property: null })}>
              <Plus className="w-4 h-4" />נכס
            </Button>
            <Button size="sm" onClick={() => setUnitModal({ open: true, unit: null })}>
              <Plus className="w-4 h-4" />יחידה
            </Button>
          </div>
        </div>
      </Card>

      {/* Legal Entities Bar */}
      {entities.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm flex items-center gap-2"><Briefcase className="w-4 h-4" />ישויות משפטיות</h3>
          </div>
          <div className="flex gap-2 flex-wrap">
            {entities.map((e) => (
              <div key={e.id} className="flex items-center gap-1 bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                <span>{e.name}</span>
                <span className="text-xs text-muted">({e.type === "company" ? "חברה" : "פרטי"})</span>
                <button
                  onClick={() => setEntityModal({ open: true, entity: e })}
                  className="p-0.5 rounded hover:bg-gray-200 text-muted"
                  aria-label="ערוך"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget({ kind: "entity", id: e.id, name: e.name })}
                  className="p-0.5 rounded hover:bg-red-50 text-danger"
                  aria-label="מחק"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Map View */}
      {view === "map" && configured && filteredComplexes.length > 0 && (
        <OccupancyMap
          complexes={filteredComplexes}
          properties={properties}
          units={units}
        />
      )}

      {/* Tree View */}
      {view === "tree" && (!configured || filteredComplexes.length === 0) ? (
        <EmptyState
          icon={Building2}
          title="לא נמצאו נכסים"
          description={configured ? "נסה לשנות את הסינון, או צור מתחם חדש" : "חבר Supabase כדי לראות נכסים"}
        />
      ) : view === "map" ? null : (
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
                <div
                  onClick={() => setExpandedComplex(isExpanded ? null : complex.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? <ChevronDown className="w-5 h-5 text-muted" /> : <ChevronLeft className="w-5 h-5 text-muted" />}
                    <Building2 className="w-5 h-5 text-primary" />
                    <div className="text-right">
                      <p className="font-semibold">{complex.name}</p>
                      <p className="text-xs text-muted">{entity?.name} · {complex.city}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">{complexProps.length} נכסים</span>
                    <span className="text-sm">
                      <span className="text-success font-medium">{complexOccupied}</span>
                      <span className="text-muted"> / {complexUnits.length}</span>
                    </span>
                    <div onClick={stop} className="flex gap-1">
                      <button
                        onClick={() => setPropertyModal({ open: true, property: null, defaultComplexId: complex.id })}
                        className="p-1 rounded hover:bg-gray-100 text-primary"
                        aria-label="הוסף נכס"
                        title="הוסף נכס"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setComplexModal({ open: true, complex })}
                        className="p-1 rounded hover:bg-gray-100 text-muted"
                        aria-label="ערוך מתחם"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ kind: "complex", id: complex.id, name: complex.name })}
                        className="p-1 rounded hover:bg-red-50 text-danger"
                        aria-label="מחק מתחם"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Properties */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {complexProps.length === 0 && (
                      <div className="px-4 py-3 text-sm text-muted text-center">
                        אין נכסים — לחץ + להוספה
                      </div>
                    )}
                    {complexProps.map((prop) => {
                      const propUnits = units.filter((u) => u.property_id === prop.id);
                      const propOccupied = propUnits.filter((u) => u.is_occupied).length;
                      const isPropExpanded = expandedProperty === prop.id;

                      return (
                        <div key={prop.id}>
                          <div
                            onClick={() => setExpandedProperty(isPropExpanded ? null : prop.id)}
                            className="w-full flex items-center justify-between px-4 py-3 pr-12 hover:bg-gray-50 border-b border-border/50 cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              {isPropExpanded ? <ChevronDown className="w-4 h-4 text-muted" /> : <ChevronLeft className="w-4 h-4 text-muted" />}
                              <span className="font-medium text-sm">{prop.name}</span>
                              {prop.dual_entity && <Badge variant="info">dual</Badge>}
                              <Badge variant={prop.property_type === "commercial" ? "warning" : "default"}>
                                {prop.property_type === "commercial" ? "עסקי" : prop.property_type === "residential" ? "מגורים" : "מעורב"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3">
                              {prop.suggested_rent ? (
                                <span className="text-xs text-success font-medium" dir="ltr" title="מחיר שכירות מוצע">
                                  {formatCurrency(prop.suggested_rent)}
                                </span>
                              ) : null}
                              <span className="text-xs text-muted">{propOccupied}/{propUnits.length} מושכרות</span>
                              <div onClick={stop} className="flex gap-1">
                                <button
                                  onClick={() => setUnitModal({ open: true, unit: null, defaultPropertyId: prop.id })}
                                  className="p-1 rounded hover:bg-gray-100 text-primary"
                                  aria-label="הוסף יחידה"
                                  title="הוסף יחידה"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setPropertyModal({ open: true, property: prop })}
                                  className="p-1 rounded hover:bg-gray-100 text-muted"
                                  aria-label="ערוך נכס"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteTarget({ kind: "property", id: prop.id, name: prop.name })}
                                  className="p-1 rounded hover:bg-red-50 text-danger"
                                  aria-label="מחק נכס"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Units */}
                          {isPropExpanded && (
                            <div className="bg-gray-50/50">
                              {propUnits.length === 0 && (
                                <div className="px-4 py-3 text-sm text-muted text-center">אין יחידות</div>
                              )}
                              {propUnits.map((unit) => (
                                <div key={unit.id} className="flex items-center justify-between px-4 py-2 pr-20 border-b border-border/30 text-sm">
                                  <div className="flex items-center gap-2">
                                    {unit.unit_type === "commercial" ? <Store className="w-3.5 h-3.5 text-muted" /> : <Home className="w-3.5 h-3.5 text-muted" />}
                                    <span>{unit.unit_identifier}</span>
                                    {unit.size_sqm && <span className="text-xs text-muted">· {unit.size_sqm} מ״ר</span>}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant={unit.is_occupied ? "success" : "danger"}>
                                      {unit.is_occupied ? "מושכר" : "פנוי"}
                                    </Badge>
                                    <button
                                      onClick={() => setUnitModal({ open: true, unit })}
                                      className="p-1 rounded hover:bg-gray-100 text-muted"
                                      aria-label="ערוך יחידה"
                                    >
                                      <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => setDeleteTarget({ kind: "unit", id: unit.id, name: unit.unit_identifier })}
                                      className="p-1 rounded hover:bg-red-50 text-danger"
                                      aria-label="מחק יחידה"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
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

      {/* Modals */}
      <LegalEntityFormModal
        isOpen={entityModal.open}
        onClose={() => setEntityModal({ open: false, entity: null })}
        entity={entityModal.entity}
      />
      <ComplexFormModal
        isOpen={complexModal.open}
        onClose={() => setComplexModal({ open: false, complex: null })}
        complex={complexModal.complex}
        defaultEntityId={complexModal.defaultEntityId}
      />
      <PropertyFormModal
        isOpen={propertyModal.open}
        onClose={() => setPropertyModal({ open: false, property: null })}
        property={propertyModal.property}
        defaultComplexId={propertyModal.defaultComplexId}
      />
      <UnitFormModal
        isOpen={unitModal.open}
        onClose={() => setUnitModal({ open: false, unit: null })}
        unit={unitModal.unit}
        defaultPropertyId={unitModal.defaultPropertyId}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        onConfirm={handleConfirmDelete}
        title="מחיקה"
        message={
          deleteTarget
            ? `${deleteError || `האם למחוק "${deleteTarget.name}"? הפעולה אינה הפיכה.`}`
            : ""
        }
        variant="danger"
        confirmText="מחק"
        isLoading={delEntity.isPending || delComplex.isPending || delProperty.isPending || delUnit.isPending}
      />
    </div>
  );
}
