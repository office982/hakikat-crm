import { supabase } from "@/lib/supabase";

export interface MonthlySummary {
  month_year: string;
  total_expected: number;
  total_paid: number;
  total_missing: number;
  overdue_count: number;
  overdue_names: string[];
  project_expenses: number;
  net_cash_flow: number;
  total_units: number;
  occupied_units: number;
  occupancy_percent: number;
}

export interface WeeklySummary {
  week_start: string;
  week_end: string;
  payments_received: number;
  payments_count: number;
  checks_due_next_7: number;
  contracts_expiring_30: number;
  overdue_tenants: { name: string; amount: number }[];
  bounced_checks_last_7: number;
}

function monthRange(monthYear: string): { start: string; endExclusive: string } {
  // monthYear format: MM/yyyy
  const [m, y] = monthYear.split("/");
  const start = `${y}-${m.padStart(2, "0")}-01`;
  const nextMonth = Number(m) + 1;
  const endExclusive =
    nextMonth > 12
      ? `${Number(y) + 1}-01-01`
      : `${y}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

/**
 * Build a monthly financial summary (same shape as the WhatsApp query_report action).
 * Returns null if no data for the month.
 */
export async function buildMonthlySummary(monthYear: string): Promise<MonthlySummary | null> {
  const { data: schedule } = await supabase
    .from("payment_schedule")
    .select("expected_amount, status, tenant_id")
    .eq("month_year", monthYear);

  if (!schedule || schedule.length === 0) return null;

  const totalExpected = schedule.reduce((s, r) => s + Number(r.expected_amount), 0);
  const paidRows = schedule.filter((r) => r.status === "paid");
  const totalPaid = paidRows.reduce((s, r) => s + Number(r.expected_amount), 0);
  const overdueRows = schedule.filter((r) => r.status === "overdue" || r.status === "pending");
  const totalMissing = overdueRows.reduce((s, r) => s + Number(r.expected_amount), 0);

  const overdueIds = [...new Set(overdueRows.map((r) => r.tenant_id))];
  let overdueNames: string[] = [];
  if (overdueIds.length > 0) {
    const { data: tenants } = await supabase
      .from("tenants")
      .select("full_name")
      .in("id", overdueIds);
    overdueNames = (tenants || []).map((t) => t.full_name);
  }

  const { count: totalUnits } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true });
  const { count: occupiedUnits } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("is_occupied", true);
  const occupancy = totalUnits ? Math.round(((occupiedUnits || 0) / totalUnits) * 100) : 0;

  const { start, endExclusive } = monthRange(monthYear);
  const { data: projExpenses } = await supabase
    .from("project_expenses")
    .select("amount")
    .gte("invoice_date", start)
    .lt("invoice_date", endExclusive);

  const totalProjectExpenses = (projExpenses || []).reduce(
    (s, e) => s + Number(e.amount),
    0
  );

  return {
    month_year: monthYear,
    total_expected: totalExpected,
    total_paid: totalPaid,
    total_missing: totalMissing,
    overdue_count: overdueRows.length,
    overdue_names: overdueNames,
    project_expenses: totalProjectExpenses,
    net_cash_flow: totalPaid - totalProjectExpenses,
    total_units: totalUnits || 0,
    occupied_units: occupiedUnits || 0,
    occupancy_percent: occupancy,
  };
}

/**
 * Format a MonthlySummary as a Hebrew WhatsApp message.
 */
export function formatMonthlySummaryHe(s: MonthlySummary): string {
  let msg = `📋 סיכום ${s.month_year}:\n`;
  msg += `• גבייה: ₪${s.total_paid.toLocaleString()} / ₪${s.total_expected.toLocaleString()}\n`;
  if (s.total_missing > 0) {
    msg += `• חסר: ₪${s.total_missing.toLocaleString()} (${s.overdue_count} דיירים)\n`;
  }
  if (s.overdue_names.length > 0) {
    msg += `• מפגרים: ${s.overdue_names.join(", ")}\n`;
  }
  if (s.project_expenses > 0) {
    msg += `• הוצאות פרויקטים: ₪${s.project_expenses.toLocaleString()}\n`;
  }
  msg += `• תזרים נקי: ₪${s.net_cash_flow.toLocaleString()}\n`;
  msg += `• תפוסה: ${s.occupancy_percent}% (${s.occupied_units}/${s.total_units} יחידות)`;
  return msg;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * Build a 7-day operational summary for the admin.
 */
export async function buildWeeklySummary(): Promise<WeeklySummary> {
  const today = new Date();
  const weekStart = addDays(today, -7);
  const todayStr = today.toISOString().split("T")[0];
  const weekStartStr = weekStart.toISOString().split("T")[0];
  const weekEndStr = addDays(today, 7).toISOString().split("T")[0];

  const { data: payments } = await supabase
    .from("payments")
    .select("amount")
    .gte("payment_date", weekStartStr)
    .lte("payment_date", todayStr);

  const paymentsReceived = (payments || []).reduce((s, p) => s + Number(p.amount), 0);
  const paymentsCount = payments?.length || 0;

  const { data: upcomingChecks } = await supabase
    .from("checks")
    .select("amount")
    .eq("status", "pending")
    .gte("due_date", todayStr)
    .lte("due_date", weekEndStr);

  const checksDueNext7 = (upcomingChecks || []).reduce((s, c) => s + Number(c.amount), 0);

  const in30 = addDays(today, 30).toISOString().split("T")[0];
  const { count: contractsExpiring30 } = await supabase
    .from("contracts")
    .select("id", { count: "exact", head: true })
    .eq("status", "active")
    .gte("end_date", todayStr)
    .lte("end_date", in30);

  const { data: overdue } = await supabase
    .from("payment_schedule")
    .select("expected_amount, tenant:tenants(full_name)")
    .eq("status", "overdue");

  const overdueByTenant = new Map<string, number>();
  for (const row of overdue || []) {
    const tName =
      (row.tenant as unknown as { full_name: string } | null)?.full_name || "—";
    overdueByTenant.set(tName, (overdueByTenant.get(tName) || 0) + Number(row.expected_amount));
  }
  const overdueTenants = Array.from(overdueByTenant.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const { count: bouncedLast7 } = await supabase
    .from("checks")
    .select("id", { count: "exact", head: true })
    .eq("status", "bounced")
    .gte("bounced_at", weekStart.toISOString());

  return {
    week_start: weekStartStr,
    week_end: todayStr,
    payments_received: paymentsReceived,
    payments_count: paymentsCount,
    checks_due_next_7: checksDueNext7,
    contracts_expiring_30: contractsExpiring30 || 0,
    overdue_tenants: overdueTenants,
    bounced_checks_last_7: bouncedLast7 || 0,
  };
}

export function formatWeeklySummaryHe(s: WeeklySummary): string {
  let msg = `📊 סיכום שבועי (${s.week_start} — ${s.week_end}):\n\n`;
  msg += `• נכנס: ₪${s.payments_received.toLocaleString()} (${s.payments_count} תשלומים)\n`;
  msg += `• צ'קים לפירעון בשבוע הבא: ₪${s.checks_due_next_7.toLocaleString()}\n`;
  if (s.bounced_checks_last_7 > 0) {
    msg += `• 🔴 צ'קים חוזרים השבוע: ${s.bounced_checks_last_7}\n`;
  }
  msg += `• חוזים שנגמרים ב-30 יום: ${s.contracts_expiring_30}\n`;

  if (s.overdue_tenants.length > 0) {
    msg += `\n⚠️ מפגרים:\n`;
    for (const t of s.overdue_tenants.slice(0, 5)) {
      msg += `  • ${t.name} — ₪${t.amount.toLocaleString()}\n`;
    }
    if (s.overdue_tenants.length > 5) {
      msg += `  ועוד ${s.overdue_tenants.length - 5}...\n`;
    }
  }
  return msg;
}
