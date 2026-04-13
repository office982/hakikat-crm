import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Payment, PaymentSchedule } from "@/types/database";

export function useMonthlySchedule(monthYear: string) {
  return useQuery({
    queryKey: ["payment_schedule", "monthly", monthYear],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      const { data, error } = await supabase
        .from("payment_schedule")
        .select(`
          *,
          tenant:tenants(*),
          contract:contracts(
            *,
            unit:units(
              *,
              property:properties(*)
            )
          )
        `)
        .eq("month_year", monthYear)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data as (PaymentSchedule & {
        tenant: import("@/types/database").Tenant;
        contract: import("@/types/database").Contract & {
          unit: import("@/types/database").Unit & {
            property: import("@/types/database").Property;
          };
        };
      })[];
    },
  });
}

export function useOverdueSchedule() {
  return useQuery({
    queryKey: ["payment_schedule", "overdue"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      const { data, error } = await supabase
        .from("payment_schedule")
        .select(`
          *,
          tenant:tenants(*),
          contract:contracts(
            *,
            unit:units(
              *,
              property:properties(*)
            )
          )
        `)
        .eq("status", "overdue")
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data as (PaymentSchedule & {
        tenant: import("@/types/database").Tenant;
        contract: import("@/types/database").Contract & {
          unit: import("@/types/database").Unit & {
            property: import("@/types/database").Property;
          };
        };
      })[];
    },
  });
}

export function usePaymentSchedule(contractId?: string, tenantId?: string) {
  return useQuery({
    queryKey: ["payment_schedule", contractId, tenantId],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("payment_schedule")
        .select("*")
        .order("due_date", { ascending: true });

      if (contractId) query = query.eq("contract_id", contractId);
      if (tenantId) query = query.eq("tenant_id", tenantId);

      const { data, error } = await query;
      if (error) throw error;
      return data as PaymentSchedule[];
    },
    enabled: !!(contractId || tenantId),
  });
}

export function usePayments(filters?: {
  tenantId?: string;
  month?: string;
}) {
  return useQuery({
    queryKey: ["payments", filters],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("payments")
        .select(`*, tenant:tenants(*)`)
        .order("payment_date", { ascending: false });

      if (filters?.tenantId) query = query.eq("tenant_id", filters.tenantId);
      if (filters?.month) query = query.eq("month_paid_for", filters.month);

      const { data, error } = await query;
      if (error) throw error;
      return data as Payment[];
    },
  });
}

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payment: {
      tenant_id: string;
      contract_id: string;
      schedule_id?: string;
      amount: number;
      payment_date: string;
      month_paid_for: string;
      payment_method: string;
      check_number?: string;
      check_bank?: string;
      check_date?: string;
      notes?: string;
      created_by?: string;
    }) => {
      // 1. Create payment
      const { data, error } = await supabase
        .from("payments")
        .insert(payment)
        .select()
        .single();

      if (error) throw error;

      // 2. Update schedule status
      if (payment.schedule_id) {
        const { data: schedule } = await supabase
          .from("payment_schedule")
          .select("expected_amount")
          .eq("id", payment.schedule_id)
          .single();

        const newStatus =
          payment.amount >= (schedule?.expected_amount || 0) ? "paid" : "partial";

        await supabase
          .from("payment_schedule")
          .update({ status: newStatus })
          .eq("id", payment.schedule_id);
      }

      // 3. Log action
      await supabase.from("action_logs").insert({
        entity_type: "payment",
        entity_id: data.id,
        action: "payment_recorded",
        description: `נרשם תשלום ₪${payment.amount.toLocaleString()} עבור ${payment.month_paid_for}`,
        source: payment.created_by || "manual",
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
