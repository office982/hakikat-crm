import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { format, addDays } from "date-fns";

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard", "stats"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return null;

      const now = new Date();
      const currentMonth = format(now, "MM/yyyy");
      const in45days = addDays(now, 45);

      // Monthly collection
      const { data: scheduleData } = await supabase
        .from("payment_schedule")
        .select("expected_amount, status")
        .eq("month_year", currentMonth);

      const expected = scheduleData?.reduce((s, r) => s + r.expected_amount, 0) || 0;
      const collected = scheduleData?.filter((r) => r.status === "paid").reduce((s, r) => s + r.expected_amount, 0) || 0;

      // Total debt
      const { data: debtData } = await supabase
        .from("payment_schedule")
        .select("expected_amount, tenant_id")
        .eq("status", "overdue");

      const totalDebt = debtData?.reduce((s, r) => s + r.expected_amount, 0) || 0;
      const debtTenants = new Set(debtData?.map((r) => r.tenant_id)).size;

      // Expiring contracts
      const { count: expiringCount } = await supabase
        .from("contracts")
        .select("*", { count: "exact", head: true })
        .eq("status", "active")
        .lte("end_date", in45days.toISOString().split("T")[0])
        .gte("end_date", now.toISOString().split("T")[0]);

      // Occupancy
      const { count: occupiedCount } = await supabase
        .from("units")
        .select("*", { count: "exact", head: true })
        .eq("is_occupied", true);

      const { count: totalUnits } = await supabase
        .from("units")
        .select("*", { count: "exact", head: true });

      return {
        monthlyCollection: { collected, expected },
        totalDebt: { amount: totalDebt, tenantsCount: debtTenants },
        expiringContracts: expiringCount || 0,
        occupancy: { occupied: occupiedCount || 0, total: totalUnits || 0 },
      };
    },
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      const { data, error } = await supabase
        .from("action_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return data;
    },
  });
}
