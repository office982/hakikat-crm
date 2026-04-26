import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { LegalEntity, Complex, Property, Unit } from "@/types/database";

export function useLegalEntities() {
  return useQuery({
    queryKey: ["legal_entities"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      const { data, error } = await supabase
        .from("legal_entities")
        .select("*")
        .order("name");

      if (error) throw error;
      return data as LegalEntity[];
    },
  });
}

export function useComplexes(entityId?: string) {
  return useQuery({
    queryKey: ["complexes", entityId],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase.from("complexes").select("*").order("name");
      if (entityId) query = query.eq("legal_entity_id", entityId);

      const { data, error } = await query;
      if (error) throw error;
      return data as Complex[];
    },
    enabled: !entityId || !!entityId,
  });
}

export function useProperties(complexId?: string) {
  return useQuery({
    queryKey: ["properties", complexId],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase.from("properties").select("*").order("name");
      if (complexId) query = query.eq("complex_id", complexId);

      const { data, error } = await query;
      if (error) throw error;
      return data as Property[];
    },
    enabled: !complexId || !!complexId,
  });
}

export function useUnits(propertyId?: string, onlyVacant = false) {
  return useQuery({
    queryKey: ["units", propertyId, onlyVacant],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase.from("units").select("*").order("unit_identifier");
      if (propertyId) query = query.eq("property_id", propertyId);
      if (onlyVacant) query = query.eq("is_occupied", false);

      const { data, error } = await query;
      if (error) throw error;
      return data as Unit[];
    },
    enabled: !propertyId || !!propertyId,
  });
}

// ─────────────────────────────────────────────────────────────
// CRUD mutations
// ─────────────────────────────────────────────────────────────

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["legal_entities"] });
  qc.invalidateQueries({ queryKey: ["complexes"] });
  qc.invalidateQueries({ queryKey: ["properties"] });
  qc.invalidateQueries({ queryKey: ["units"] });
  qc.invalidateQueries({ queryKey: ["notifications"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

// One row in notifications + one row in action_logs per CRUD action.
// Errors swallowed — callers don't depend on it.
async function logAndNotify(params: {
  action: string;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
}) {
  try {
    await Promise.all([
      supabase.from("action_logs").insert({
        entity_type: params.entityType,
        entity_id: params.entityId,
        action: params.action,
        description: params.description,
        source: "manual",
        performed_by: "user",
      }),
      supabase.from("notifications").insert({
        type: params.action,
        entity_type: params.entityType,
        entity_id: params.entityId,
        title: params.title,
        message: params.description,
      }),
    ]);
  } catch (err) {
    console.error("logAndNotify failed:", err);
  }
}

export interface LegalEntityInput {
  name: string;
  type: "company" | "personal";
  tax_id?: string | null;
  landlord_name?: string | null;
}

export function useCreateLegalEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LegalEntityInput) => {
      const { data, error } = await supabase
        .from("legal_entities")
        .insert({
          name: input.name,
          type: input.type,
          tax_id: input.tax_id ?? null,
          landlord_name: input.landlord_name ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAndNotify({
        action: "entity_created",
        entityType: "legal_entity",
        entityId: data.id,
        title: `🏢 ישות משפטית חדשה — ${input.name}`,
        description: `נפתחה ישות משפטית "${input.name}" (${input.type === "company" ? "חברה" : "פרטי"}).`,
      });
      return data as LegalEntity;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateLegalEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: LegalEntityInput & { id: string }) => {
      const { data, error } = await supabase
        .from("legal_entities")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as LegalEntity;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteLegalEntity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("complexes")
        .select("id", { count: "exact", head: true })
        .eq("legal_entity_id", id);
      if ((count || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${count} מתחמים תחת ישות זו.`);
      }
      const { error } = await supabase.from("legal_entities").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export interface ComplexInput {
  name: string;
  legal_entity_id: string;
  address?: string | null;
  city?: string | null;
}

export function useCreateComplex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ComplexInput) => {
      const { data, error } = await supabase
        .from("complexes")
        .insert({
          name: input.name,
          legal_entity_id: input.legal_entity_id,
          address: input.address ?? null,
          city: input.city ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      await logAndNotify({
        action: "complex_created",
        entityType: "complex",
        entityId: data.id,
        title: `🏗 מתחם חדש — ${input.name}`,
        description: `נפתח מתחם "${input.name}".`,
      });
      return data as Complex;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateComplex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ComplexInput & { id: string }) => {
      const { data, error } = await supabase
        .from("complexes")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Complex;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteComplex() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("complex_id", id);
      if ((count || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${count} נכסים תחת מתחם זה.`);
      }
      const { error } = await supabase.from("complexes").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export interface PropertyInput {
  name: string;
  complex_id: string;
  legal_entity_id: string;
  secondary_legal_entity_id?: string | null;
  dual_entity?: boolean;
  address?: string | null;
  city?: string | null;
  property_type?: "residential" | "commercial" | "mixed";
}

export function useCreateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PropertyInput) => {
      const { data, error } = await supabase
        .from("properties")
        .insert({
          name: input.name,
          complex_id: input.complex_id,
          legal_entity_id: input.legal_entity_id,
          secondary_legal_entity_id: input.secondary_legal_entity_id ?? null,
          dual_entity: input.dual_entity ?? false,
          address: input.address ?? null,
          city: input.city ?? null,
          property_type: input.property_type ?? "residential",
        })
        .select()
        .single();
      if (error) throw error;
      await logAndNotify({
        action: "property_created",
        entityType: "property",
        entityId: data.id,
        title: `🏠 נכס חדש — ${input.name}`,
        description: `נפתח נכס "${input.name}" (${input.property_type ?? "residential"}).`,
      });
      return data as Property;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: PropertyInput & { id: string }) => {
      const { data, error } = await supabase
        .from("properties")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Property;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("units")
        .select("id", { count: "exact", head: true })
        .eq("property_id", id);
      if ((count || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${count} יחידות תחת נכס זה.`);
      }
      const { error } = await supabase.from("properties").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export interface UnitInput {
  property_id: string;
  unit_identifier: string;
  unit_type: "residential" | "commercial";
  floor?: number | null;
  size_sqm?: number | null;
  notes?: string | null;
  is_occupied?: boolean;
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitInput) => {
      const { data, error } = await supabase
        .from("units")
        .insert({
          property_id: input.property_id,
          unit_identifier: input.unit_identifier,
          unit_type: input.unit_type,
          floor: input.floor ?? null,
          size_sqm: input.size_sqm ?? null,
          notes: input.notes ?? null,
          is_occupied: input.is_occupied ?? false,
        })
        .select()
        .single();
      if (error) throw error;
      await logAndNotify({
        action: "unit_created",
        entityType: "unit",
        entityId: data.id,
        title: `🚪 יחידה חדשה — ${input.unit_identifier}`,
        description: `נפתחה יחידה "${input.unit_identifier}" (${input.unit_type}).`,
      });
      return data as Unit;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: UnitInput & { id: string }) => {
      const { data, error } = await supabase
        .from("units")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Unit;
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("unit_id", id)
        .in("status", ["active", "pending_signature"]);
      if ((count || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${count} חוזים פעילים על יחידה זו.`);
      }
      const { error } = await supabase.from("units").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateAll(qc),
  });
}
