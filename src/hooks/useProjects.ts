import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Project, ProjectExpense } from "@/types/database";

export function useProjects(filters?: { status?: string }) {
  return useQuery({
    queryKey: ["projects", filters],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      let query = supabase
        .from("projects")
        .select(`
          *,
          legal_entity:legal_entities(id, name),
          expenses:project_expenses(id, amount, status)
        `)
        .order("created_at", { ascending: false });

      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Compute spent and unpaid_invoices from expenses
      return (data || []).map((p: any) => {
        const expenses: ProjectExpense[] = p.expenses || [];
        const spent = expenses.reduce((s, e) => s + (e.amount || 0), 0);
        const unpaidInvoices = expenses.filter((e) => e.status === "unpaid").length;

        return {
          ...p,
          spent,
          unpaid_invoices: unpaidInvoices,
        } as Project & { spent: number; unpaid_invoices: number };
      });
    },
  });
}

export function useProjectExpenses(projectId?: string) {
  return useQuery({
    queryKey: ["project_expenses", projectId],
    queryFn: async () => {
      if (!isSupabaseConfigured() || !projectId) return [];

      const { data, error } = await supabase
        .from("project_expenses")
        .select("*")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ProjectExpense[];
    },
    enabled: !!projectId,
  });
}
