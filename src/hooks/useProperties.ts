import { useQuery } from "@tanstack/react-query";
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
