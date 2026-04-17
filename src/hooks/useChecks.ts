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
      status: "deposited" | "cancelled";
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

/**
 * Mark a check as bounced via the atomic bounce_check_tx RPC.
 * Reverts the payment schedule row to overdue, decrements the
 * contract's checks_received, and logs.
 */
export function useBounceCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      tenant_id,
      for_month,
      reason,
    }: {
      tenant_id: string;
      for_month: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("bounce_check_tx", {
        p_tenant_id: tenant_id,
        p_for_month: for_month,
        p_reason: reason || null,
      });
      if (error) throw error;
      return data as { check_id: string | null; schedule_id: string | null; amount: number | null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checks"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

/**
 * Create a replacement check that points back to the bounced original.
 */
export function useCreateReplacementCheck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (check: {
      replacement_for: string;
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
