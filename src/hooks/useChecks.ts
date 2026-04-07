import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Check } from "@/types/database";

export function useChecks(filters?: {
  tenantId?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ["checks", filters],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("checks")
        .select(`*, tenant:tenants(*)`)
        .order("due_date", { ascending: true });

      if (filters?.tenantId) query = query.eq("tenant_id", filters.tenantId);
      if (filters?.status) query = query.eq("status", filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return data as Check[];
    },
  });
}

export function useCreateCheck() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (check: {
      tenant_id: string;
      contract_id: string;
      check_number: string;
      bank_name?: string;
      branch_number?: string;
      account_number?: string;
      amount: number;
      due_date: string;
      for_month: string;
    }) => {
      const { data, error } = await supabase
        .from("checks")
        .insert(check)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checks"] });
    },
  });
}

export function useUpdateCheckStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: "deposited" | "bounced" | "cancelled";
    }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "deposited") {
        updates.deposited_date = new Date().toISOString().split("T")[0];
      }

      const { data, error } = await supabase
        .from("checks")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checks"] });
    },
  });
}
