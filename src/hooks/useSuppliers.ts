import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Supplier } from "@/types/database";

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });
}

export interface SupplierInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["suppliers"] });
  qc.invalidateQueries({ queryKey: ["project_expenses"] });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SupplierInput) => {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: SupplierInput & { id: string }) => {
      const { data, error } = await supabase
        .from("suppliers")
        .update(input)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Supplier;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { count } = await supabase
        .from("project_expenses")
        .select("id", { count: "exact", head: true })
        .eq("supplier_id", id);
      if ((count || 0) > 0) {
        throw new Error(`לא ניתן למחוק — יש ${count} הוצאות תחת ספק זה.`);
      }
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => invalidate(qc),
  });
}
