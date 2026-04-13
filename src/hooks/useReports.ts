import { useQuery } from "@tanstack/react-query";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { format, subMonths, addMonths } from "date-fns";

/** Convert Date to MM/YYYY string used by payment_schedule.month_year */
function toMonthYear(d: Date): string {
  return format(d, "MM/yyyy");
}

const SHORT_MONTHS = [
  "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
  "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳",
];

function monthYearLabel(my: string): string {
  const [mm, yyyy] = my.split("/");
  return `${SHORT_MONTHS[parseInt(mm) - 1]} ${yyyy.slice(2)}`;
}

// ── Revenue data for charts (12 months back) ────────────────────────────

export interface MonthlyRevenue {
  monthYear: string;
  month: string; // display label
  expected: number;
  actual: number;
}

export function useRevenueByMonth(filters?: {
  legalEntityId?: string;
  months?: number; // default 12
}) {
  const monthsBack = filters?.months ?? 12;

  return useQuery({
    queryKey: ["reports", "revenue", filters?.legalEntityId, monthsBack],
    queryFn: async (): Promise<MonthlyRevenue[]> => {
      if (!isSupabaseConfigured()) return [];

      const now = new Date();
      const result: MonthlyRevenue[] = [];

      // Build list of month_year strings we need
      const monthKeys: string[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = subMonths(now, i);
        monthKeys.push(toMonthYear(d));
      }

      // --- Fetch expected amounts from payment_schedule (join contracts for entity filter) ---
      let scheduleQuery = supabase
        .from("payment_schedule")
        .select("month_year, expected_amount, status, contract:contracts(legal_entity_id)")
        .in("month_year", monthKeys);

      const { data: scheduleRows, error: schedErr } = await scheduleQuery;
      if (schedErr) throw schedErr;

      // --- Fetch actual payments ---
      let paymentsQuery = supabase
        .from("payments")
        .select("month_paid_for, amount, contract:contracts(legal_entity_id)")
        .in("month_paid_for", monthKeys);

      const { data: paymentRows, error: payErr } = await paymentsQuery;
      if (payErr) throw payErr;

      // Aggregate
      for (const my of monthKeys) {
        const filteredSchedule = (scheduleRows || []).filter((r: any) => {
          if (r.month_year !== my) return false;
          if (filters?.legalEntityId && r.contract?.legal_entity_id !== filters.legalEntityId) return false;
          return true;
        });

        const filteredPayments = (paymentRows || []).filter((r: any) => {
          if (r.month_paid_for !== my) return false;
          if (filters?.legalEntityId && r.contract?.legal_entity_id !== filters.legalEntityId) return false;
          return true;
        });

        const expected = filteredSchedule.reduce((s: number, r: any) => s + (r.expected_amount || 0), 0);
        const actual = filteredPayments.reduce((s: number, r: any) => s + (r.amount || 0), 0);

        result.push({ monthYear: my, month: monthYearLabel(my), expected, actual });
      }

      return result;
    },
  });
}

// ── KPI stats ────────────────────────────────────────────────────────────

export interface ReportKPIs {
  monthlyExpected: number;
  monthlyCollected: number;
  annualCollection: number;
  averageMonthly: number;
  openDebts: number;
  debtTenants: number;
}

export function useReportKPIs(filters?: { legalEntityId?: string }) {
  return useQuery({
    queryKey: ["reports", "kpis", filters?.legalEntityId],
    queryFn: async (): Promise<ReportKPIs | null> => {
      if (!isSupabaseConfigured()) return null;

      const now = new Date();
      const currentMonth = toMonthYear(now);
      const currentYear = now.getFullYear().toString();

      // Current month schedule
      let schedQ = supabase
        .from("payment_schedule")
        .select("expected_amount, status, tenant_id, contract:contracts(legal_entity_id)")
        .eq("month_year", currentMonth);

      const { data: schedData } = await schedQ;

      const filtered = (schedData || []).filter((r: any) =>
        !filters?.legalEntityId || r.contract?.legal_entity_id === filters.legalEntityId
      );

      const monthlyExpected = filtered.reduce((s: number, r: any) => s + (r.expected_amount || 0), 0);
      const monthlyCollected = filtered
        .filter((r: any) => r.status === "paid")
        .reduce((s: number, r: any) => s + (r.expected_amount || 0), 0);

      // Annual collection (all payments this calendar year)
      const startOfYear = `${currentYear}-01-01`;
      let annualQ = supabase
        .from("payments")
        .select("amount, contract:contracts(legal_entity_id)")
        .gte("payment_date", startOfYear);

      const { data: annualData } = await annualQ;
      const annualFiltered = (annualData || []).filter((r: any) =>
        !filters?.legalEntityId || r.contract?.legal_entity_id === filters.legalEntityId
      );
      const annualCollection = annualFiltered.reduce((s: number, r: any) => s + (r.amount || 0), 0);

      // Average monthly (12 months)
      const monthKeys: string[] = [];
      for (let i = 11; i >= 0; i--) {
        monthKeys.push(toMonthYear(subMonths(now, i)));
      }

      let avg12Q = supabase
        .from("payments")
        .select("amount, month_paid_for, contract:contracts(legal_entity_id)")
        .in("month_paid_for", monthKeys);

      const { data: avg12Data } = await avg12Q;
      const avg12Filtered = (avg12Data || []).filter((r: any) =>
        !filters?.legalEntityId || r.contract?.legal_entity_id === filters.legalEntityId
      );
      const totalLast12 = avg12Filtered.reduce((s: number, r: any) => s + (r.amount || 0), 0);
      const averageMonthly = Math.round(totalLast12 / 12);

      // Open debts
      let debtQ = supabase
        .from("payment_schedule")
        .select("expected_amount, tenant_id, contract:contracts(legal_entity_id)")
        .eq("status", "overdue");

      const { data: debtData } = await debtQ;
      const debtFiltered = (debtData || []).filter((r: any) =>
        !filters?.legalEntityId || r.contract?.legal_entity_id === filters.legalEntityId
      );
      const openDebts = debtFiltered.reduce((s: number, r: any) => s + (r.expected_amount || 0), 0);
      const debtTenants = new Set(debtFiltered.map((r: any) => r.tenant_id)).size;

      return { monthlyExpected, monthlyCollected, annualCollection, averageMonthly, openDebts, debtTenants };
    },
  });
}

// ── Entity breakdown (pie chart) ─────────────────────────────────────────

export interface EntityBreakdown {
  name: string;
  value: number;
  entityId: string;
}

export function useEntityBreakdown() {
  return useQuery({
    queryKey: ["reports", "entityBreakdown"],
    queryFn: async (): Promise<EntityBreakdown[]> => {
      if (!isSupabaseConfigured()) return [];

      const now = new Date();
      const currentMonth = toMonthYear(now);

      const { data: schedData } = await supabase
        .from("payment_schedule")
        .select("expected_amount, contract:contracts(legal_entity_id, legal_entity:legal_entities(name))")
        .eq("month_year", currentMonth);

      const map = new Map<string, { name: string; value: number; entityId: string }>();

      for (const row of schedData || []) {
        const entityId = (row as any).contract?.legal_entity_id;
        const entityName = (row as any).contract?.legal_entity?.name || "לא ידוע";
        if (!entityId) continue;

        const existing = map.get(entityId);
        if (existing) {
          existing.value += row.expected_amount || 0;
        } else {
          map.set(entityId, { name: entityName, value: row.expected_amount || 0, entityId });
        }
      }

      return Array.from(map.values()).sort((a, b) => b.value - a.value);
    },
  });
}

// ── Forecast (12 months forward) ─────────────────────────────────────────

export interface ForecastMonth {
  month: string;
  monthYear: string;
  expected: number;
  expiringContracts: number;
  risk: boolean;
}

export function useForecast(filters?: { legalEntityId?: string }) {
  return useQuery({
    queryKey: ["reports", "forecast", filters?.legalEntityId],
    queryFn: async (): Promise<ForecastMonth[]> => {
      if (!isSupabaseConfigured()) return [];

      const now = new Date();
      const result: ForecastMonth[] = [];

      // Build future month keys (next 12 months starting from next month)
      const monthKeys: string[] = [];
      const monthDates: Date[] = [];
      for (let i = 1; i <= 12; i++) {
        const d = addMonths(now, i);
        monthKeys.push(toMonthYear(d));
        monthDates.push(d);
      }

      // Fetch active contracts with end_date to detect expiring ones
      let contractQ = supabase
        .from("contracts")
        .select("id, legal_entity_id, monthly_rent, end_date, status")
        .eq("status", "active");

      if (filters?.legalEntityId) {
        contractQ = contractQ.eq("legal_entity_id", filters.legalEntityId);
      }

      const { data: contracts } = await contractQ;

      // Also get future schedule if it exists
      const { data: futureSchedule } = await supabase
        .from("payment_schedule")
        .select("month_year, expected_amount, contract:contracts(legal_entity_id)")
        .in("month_year", monthKeys);

      // Current month expected (for reference line)
      for (let i = 0; i < monthKeys.length; i++) {
        const my = monthKeys[i];
        const d = monthDates[i];

        // Try schedule first
        const schedRows = (futureSchedule || []).filter((r: any) => {
          if (r.month_year !== my) return false;
          if (filters?.legalEntityId && r.contract?.legal_entity_id !== filters.legalEntityId) return false;
          return true;
        });

        let expected: number;
        if (schedRows.length > 0) {
          expected = schedRows.reduce((s: number, r: any) => s + (r.expected_amount || 0), 0);
        } else {
          // Estimate from active contracts still valid that month
          expected = (contracts || [])
            .filter((c) => new Date(c.end_date) >= d)
            .reduce((s, c) => s + (c.monthly_rent || 0), 0);
        }

        // Count expiring contracts in this month
        const expiring = (contracts || []).filter((c) => {
          const endDate = new Date(c.end_date);
          return endDate.getFullYear() === d.getFullYear() && endDate.getMonth() === d.getMonth();
        }).length;

        result.push({
          month: monthYearLabel(my),
          monthYear: my,
          expected,
          expiringContracts: expiring,
          risk: expiring > 0,
        });
      }

      return result;
    },
  });
}

// ── Legal entities for filter dropdown ────────────────────────────────────

export function useLegalEntities() {
  return useQuery({
    queryKey: ["legal_entities"],
    queryFn: async () => {
      if (!isSupabaseConfigured()) return [];

      const { data, error } = await supabase
        .from("legal_entities")
        .select("id, name, type")
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });
}

// ── Monthly table data (paid/unpaid tenant counts) ───────────────────────

export interface MonthlyTableRow {
  monthYear: string;
  month: string;
  expected: number;
  actual: number;
  gap: number;
  percent: number;
  paidCount: number;
  unpaidCount: number;
}

export function useMonthlyTableData(filters?: {
  legalEntityId?: string;
  months?: number;
}) {
  const monthsBack = filters?.months ?? 12;

  return useQuery({
    queryKey: ["reports", "monthlyTable", filters?.legalEntityId, monthsBack],
    queryFn: async (): Promise<MonthlyTableRow[]> => {
      if (!isSupabaseConfigured()) return [];

      const now = new Date();
      const monthKeys: string[] = [];
      for (let i = monthsBack - 1; i >= 0; i--) {
        monthKeys.push(toMonthYear(subMonths(now, i)));
      }

      // Schedule data with status
      const { data: schedData } = await supabase
        .from("payment_schedule")
        .select("month_year, expected_amount, status, tenant_id, contract:contracts(legal_entity_id)")
        .in("month_year", monthKeys);

      // Payments
      const { data: payData } = await supabase
        .from("payments")
        .select("month_paid_for, amount, contract:contracts(legal_entity_id)")
        .in("month_paid_for", monthKeys);

      const result: MonthlyTableRow[] = [];

      for (const my of monthKeys) {
        const sched = (schedData || []).filter((r: any) => {
          if (r.month_year !== my) return false;
          if (filters?.legalEntityId && r.contract?.legal_entity_id !== filters.legalEntityId) return false;
          return true;
        });

        const pays = (payData || []).filter((r: any) => {
          if (r.month_paid_for !== my) return false;
          if (filters?.legalEntityId && r.contract?.legal_entity_id !== filters.legalEntityId) return false;
          return true;
        });

        const expected = sched.reduce((s: number, r: any) => s + (r.expected_amount || 0), 0);
        const actual = pays.reduce((s: number, r: any) => s + (r.amount || 0), 0);
        const gap = expected - actual;
        const percent = expected > 0 ? Math.round((actual / expected) * 100) : 0;

        const paidTenants = new Set(sched.filter((r: any) => r.status === "paid").map((r: any) => r.tenant_id));
        const allTenants = new Set(sched.map((r: any) => r.tenant_id));

        result.push({
          monthYear: my,
          month: monthYearLabel(my),
          expected,
          actual,
          gap,
          percent,
          paidCount: paidTenants.size,
          unpaidCount: allTenants.size - paidTenants.size,
        });
      }

      return result;
    },
  });
}
