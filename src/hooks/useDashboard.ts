import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { format, addDays, subMonths } from "date-fns";

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

export function useRevenueData() {
  return useQuery({
    queryKey: ["dashboard", "revenue"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return null;

      const now = new Date();
      const months: { key: string; label: string }[] = [];
      const hebrewMonths = [
        "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
        "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳",
      ];

      for (let i = 11; i >= 0; i--) {
        const d = subMonths(now, i);
        const mm = format(d, "MM");
        const yyyy = format(d, "yyyy");
        const key = `${mm}/${yyyy}`;
        const label = `${hebrewMonths[d.getMonth()]} ${yyyy.slice(2)}`;
        months.push({ key, label });
      }

      const monthKeys = months.map((m) => m.key);

      // Get expected amounts from payment_schedule
      const { data: scheduleData } = await supabase
        .from("payment_schedule")
        .select("month_year, expected_amount")
        .in("month_year", monthKeys);

      // Get actual payments
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("month_paid_for, amount")
        .in("month_paid_for", monthKeys);

      // Aggregate per month
      const expectedByMonth: Record<string, number> = {};
      const actualByMonth: Record<string, number> = {};

      scheduleData?.forEach((row) => {
        expectedByMonth[row.month_year] = (expectedByMonth[row.month_year] || 0) + row.expected_amount;
      });

      paymentsData?.forEach((row) => {
        actualByMonth[row.month_paid_for] = (actualByMonth[row.month_paid_for] || 0) + row.amount;
      });

      return months.map((m) => ({
        month: m.label,
        expected: expectedByMonth[m.key] || 0,
        actual: actualByMonth[m.key] || 0,
      }));
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
