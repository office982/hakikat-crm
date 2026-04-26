"use client";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { Complex, Property, Unit } from "@/types/database";

interface Props {
  complexes: Complex[];
  properties: Property[];
  units: Unit[];
}

export function OccupancyMap({ complexes, properties, units }: Props) {
  return (
    <div className="space-y-4">
      {complexes.map((complex) => {
        const complexProps = properties.filter((p) => p.complex_id === complex.id);
        const complexUnits = units.filter((u) => complexProps.some((p) => p.id === u.property_id));
        const occupied = complexUnits.filter((u) => u.is_occupied).length;
        const occupancy = complexUnits.length
          ? Math.round((occupied / complexUnits.length) * 100)
          : 0;

        return (
          <Card key={complex.id} noPadding>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <p className="font-semibold">{complex.name}</p>
                <p className="text-xs text-muted">
                  {occupied} / {complexUnits.length} מושכרות · {occupancy}%
                </p>
              </div>
              <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    occupancy === 100
                      ? "bg-success"
                      : occupancy >= 70
                      ? "bg-warning"
                      : "bg-danger"
                  )}
                  style={{ width: `${occupancy}%` }}
                />
              </div>
            </div>

            <div className="p-4 space-y-3">
              {complexProps.length === 0 && (
                <p className="text-sm text-muted text-center py-4">אין נכסים במתחם</p>
              )}
              {complexProps.map((prop) => {
                const propUnits = units.filter((u) => u.property_id === prop.id);
                if (propUnits.length === 0) {
                  return (
                    <div key={prop.id} className="text-sm text-muted">
                      {prop.name} — אין יחידות
                    </div>
                  );
                }
                return (
                  <div key={prop.id}>
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <span className="font-medium">{prop.name}</span>
                      <span className="text-xs text-muted">
                        {propUnits.filter((u) => u.is_occupied).length}/{propUnits.length}
                      </span>
                    </div>
                    <div className="grid grid-cols-8 sm:grid-cols-12 lg:grid-cols-16 gap-1.5">
                      {propUnits.map((unit) => (
                        <div
                          key={unit.id}
                          title={`${unit.unit_identifier} — ${unit.is_occupied ? "מושכר" : "פנוי"}`}
                          className={cn(
                            "aspect-square rounded flex items-center justify-center text-[10px] font-medium",
                            unit.is_occupied
                              ? "bg-success/15 text-success border border-success/40"
                              : "bg-danger/10 text-danger border border-danger/40"
                          )}
                        >
                          {unit.unit_identifier.slice(0, 3)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
