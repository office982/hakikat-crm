import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Contract } from "@/types/database";
import { generatePaymentSchedule } from "@/lib/payment-calculator";

export function useContracts(filters?: {
  status?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ["contracts", filters],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("contracts")
        .select(`
          *,
          tenant:tenants(*),
          unit:units(
            *,
            property:properties(
              *,
              complex:complexes(*)
            )
          ),
          legal_entity:legal_entities(*)
        `)
        .order("end_date", { ascending: true });

      if (filters?.status === "active") {
        query = query.eq("status", "active");
      } else if (filters?.status === "expired") {
        query = query.eq("status", "expired");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Contract[];
    },
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contract: {
      tenant_id: string;
      unit_id: string;
      legal_entity_id: string;
      start_date: string;
      end_date: string;
      monthly_rent: number;
      annual_increase_percent: number;
      building_fee: number;
      arnona: number;
      payment_method: string;
      total_checks: number;
    }) => {
      // 1. Create contract
      const { data: newContract, error } = await supabase
        .from("contracts")
        .insert(contract)
        .select()
        .single();

      if (error) throw error;

      // 2. Generate payment schedule
      const schedule = generatePaymentSchedule({
        start_date: contract.start_date,
        end_date: contract.end_date,
        monthly_rent: contract.monthly_rent,
        annual_increase_percent: contract.annual_increase_percent,
      });

      const scheduleRows = schedule.map((row) => ({
        contract_id: newContract.id,
        tenant_id: contract.tenant_id,
        month_year: row.month_year,
        due_date: row.due_date,
        expected_amount: row.expected_amount,
        year_number: row.year_number,
        status: "pending",
      }));

      const { error: scheduleError } = await supabase
        .from("payment_schedule")
        .insert(scheduleRows);

      if (scheduleError) throw scheduleError;

      // 3. Mark unit as occupied
      await supabase
        .from("units")
        .update({ is_occupied: true })
        .eq("id", contract.unit_id);

      return newContract;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      start_date?: string;
      end_date?: string;
      monthly_rent?: number;
      annual_increase_percent?: number;
      building_fee?: number;
      arnona?: number;
      payment_method?: "checks" | "transfer" | "cash";
      total_checks?: number;
      status?: "active" | "pending_signature" | "expired" | "cancelled";
      google_drive_url?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("contracts")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const [{ count: paymentsCount }, { count: checksCount }, contractRow] = await Promise.all([
        supabase.from("payments").select("id", { count: "exact", head: true }).eq("contract_id", id),
        supabase.from("checks").select("id", { count: "exact", head: true }).eq("contract_id", id),
        supabase.from("contracts").select("unit_id").eq("id", id).single(),
      ]);
      if ((paymentsCount || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${paymentsCount} תשלומים תחת חוזה זה.`);
      }
      if ((checksCount || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${checksCount} צ'קים תחת חוזה זה.`);
      }
      // Remove payment_schedule rows first (no payments rely on them)
      const { error: schedErr } = await supabase
        .from("payment_schedule")
        .delete()
        .eq("contract_id", id);
      if (schedErr) throw schedErr;

      const { error } = await supabase.from("contracts").delete().eq("id", id);
      if (error) throw error;

      // Free up the unit
      if (contractRow.data?.unit_id) {
        await supabase
          .from("units")
          .update({ is_occupied: false })
          .eq("id", contractRow.data.unit_id);
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
