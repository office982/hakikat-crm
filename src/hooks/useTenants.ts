import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Tenant } from "@/types/database";

export function useTenants(filters?: {
  search?: string;
  entity?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["tenants", filters],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("tenants")
        .select(`
          *,
          unit:units(
            *,
            property:properties(
              *,
              complex:complexes(*),
              legal_entity:legal_entities(*)
            )
          ),
          contracts(*)
        `)
        .order("created_at", { ascending: false });

      if (filters?.search) {
        query = query.or(
          `full_name.ilike.%${filters.search}%,id_number.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`
        );
      }

      if (filters?.status === "active") {
        query = query.eq("is_active", true);
      } else if (filters?.status === "inactive") {
        query = query.eq("is_active", false);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Tenant[];
    },
  });
}

export function useTenant(id: string) {
  return useQuery({
    queryKey: ["tenant", id],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return null;

      const { data, error } = await supabase
        .from("tenants")
        .select(`
          *,
          unit:units(
            *,
            property:properties(
              *,
              complex:complexes(*),
              legal_entity:legal_entities(*)
            )
          ),
          contracts(
            *,
            legal_entity:legal_entities(*),
            payment_schedule(*)
          )
        `)
        .eq("id", id)
        .single();

      if (error) throw error;
      return data as Tenant;
    },
    enabled: !!id,
  });
}

export function useCreateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tenant: {
      full_name: string;
      id_number: string;
      phone: string;
      whatsapp?: string;
      email?: string;
      unit_id?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from("tenants")
        .insert(tenant)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}

export function useUpdateTenant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Tenant> & { id: string }) => {
      const { data, error } = await supabase
        .from("tenants")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["tenant", variables.id] });
    },
  });
}
