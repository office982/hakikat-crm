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
      auto_issue_receipt?: boolean;
    }) => {
      const { auto_issue_receipt, ...insertPayload } = payment;

      // 1. Create payment via atomic RPC (insert + schedule update + log)
      let expectedAmount = 0;
      if (insertPayload.schedule_id) {
        const { data: schedule } = await supabase
          .from("payment_schedule")
          .select("expected_amount")
          .eq("id", insertPayload.schedule_id)
          .single();
        expectedAmount = schedule?.expected_amount || 0;
      }

      const { data: paymentId, error } = await supabase.rpc("record_payment_manual_tx", {
        p_tenant_id: insertPayload.tenant_id,
        p_contract_id: insertPayload.contract_id,
        p_schedule_id: insertPayload.schedule_id || null,
        p_amount: insertPayload.amount,
        p_payment_date: insertPayload.payment_date,
        p_month_paid_for: insertPayload.month_paid_for,
        p_payment_method: insertPayload.payment_method,
        p_check_number: insertPayload.check_number || null,
        p_check_bank: insertPayload.check_bank || null,
        p_check_date: insertPayload.check_date || null,
        p_notes: insertPayload.notes || null,
        p_expected_amount: expectedAmount,
        p_created_by: insertPayload.created_by || "manual",
      });

      if (error) throw error;

      // 2. Optional: auto-issue receipt via server-side route (handles Morning + skip rules).
      if (auto_issue_receipt && paymentId) {
        try {
          await fetch(`/api/payments/${paymentId}/issue-receipt`, { method: "POST" });
        } catch (receiptErr) {
          console.warn("auto-issue receipt failed:", receiptErr);
        }
      }

      return { id: paymentId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useUpdatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: string;
      amount?: number;
      payment_date?: string;
      month_paid_for?: string;
      payment_method?: "check" | "transfer" | "cash";
      check_number?: string | null;
      check_bank?: string | null;
      check_date?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("payments")
        .update(updates)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Payment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeletePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { data: payment, error: fetchErr } = await supabase
        .from("payments")
        .select("schedule_id, contract_id, tenant_id, month_paid_for")
        .eq("id", id)
        .single();
      if (fetchErr) throw fetchErr;

      const { error } = await supabase.from("payments").delete().eq("id", id);
      if (error) throw error;

      // Recompute schedule row status for the affected month
      if (payment.schedule_id) {
        const { data: remaining } = await supabase
          .from("payments")
          .select("amount")
          .eq("schedule_id", payment.schedule_id);
        const { data: schedule } = await supabase
          .from("payment_schedule")
          .select("expected_amount, due_date")
          .eq("id", payment.schedule_id)
          .single();

        const totalPaid = (remaining || []).reduce((s, p) => s + (p.amount || 0), 0);
        const expected = schedule?.expected_amount || 0;
        let status: "paid" | "partial" | "pending" | "overdue" = "pending";
        if (totalPaid >= expected) status = "paid";
        else if (totalPaid > 0) status = "partial";
        else {
          const dueDate = schedule?.due_date ? new Date(schedule.due_date) : null;
          status = dueDate && dueDate < new Date() ? "overdue" : "pending";
        }
        await supabase
          .from("payment_schedule")
          .update({ status })
          .eq("id", payment.schedule_id);
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
      queryClient.invalidateQueries({ queryKey: ["payment_schedule"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useIssueReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (paymentId: string) => {
      const res = await fetch(`/api/payments/${paymentId}/issue-receipt`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "failed" }));
        throw new Error(err.error || "failed");
      }
      return res.json() as Promise<{ docnum?: number; doc_url?: string; skipped?: boolean }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}
