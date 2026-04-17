import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useProject(projectId?: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async () => {
      if (!isSupabaseConfigured() || !projectId) return null;
      const { data, error } = await supabase
        .from("projects")
        .select(`*, legal_entity:legal_entities(id, name)`)
        .eq("id", projectId)
        .single();
      if (error) throw error;
      return data as Project;
    },
    enabled: !!projectId,
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

export interface ProjectInput {
  name: string;
  legal_entity_id: string;
  address?: string | null;
  description?: string | null;
  total_budget?: number;
  status?: "planning" | "active" | "completed";
  start_date?: string | null;
  end_date?: string | null;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["projects"] });
  qc.invalidateQueries({ queryKey: ["project"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ProjectInput) => {
      const { data, error } = await supabase
        .from("projects")
        .insert({
          name: input.name,
          legal_entity_id: input.legal_entity_id,
          address: input.address ?? null,
          description: input.description ?? null,
          total_budget: input.total_budget ?? 0,
          status: input.status ?? "planning",
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from("action_logs").insert({
        entity_type: "project",
        entity_id: data.id,
        action: "project_created",
        description: `נפתח פרויקט ${input.name}`,
        source: "manual",
      });

      return data as Project;
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: ProjectInput & { id: string }) => {
      const { data, error } = await supabase
        .from("projects")
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Project;
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Refuse to delete a project that still has expenses — caller must
      // handle expenses first. Keep data integrity instead of cascading.
      const { count } = await supabase
        .from("project_expenses")
        .select("id", { count: "exact", head: true })
        .eq("project_id", id);

      if ((count || 0) > 0) {
        throw new Error(`לפרויקט יש ${count} הוצאות קיימות. מחק או העבר אותן קודם.`);
      }

      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidateAll(queryClient),
  });
}
