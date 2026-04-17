import { supabase } from "@/lib/supabase";
import type { Check } from "@/types/database";

export interface CheckComparisonResult {
  expected_total: number;
  received_total: number;
  gap: number;
  months_covered: string[];
  months_missing: string[];
  duplicates: Check[];
  bounced: Check[];
  replaced: { original: Check; replacement: Check }[];
}

/**
 * Compare the check record for a tenant/contract against the payment schedule.
 * - months_missing: schedule months with no check or whose check is bounced/cancelled
 * - duplicates: same check_number appearing more than once
 * - replaced: bounced checks that have a replacement_for pointer
 */
export async function compareChecksForContract(
  contractId: string
): Promise<CheckComparisonResult> {
  const [{ data: checks }, { data: schedule }] = await Promise.all([
    supabase
      .from("checks")
      .select("*")
      .eq("contract_id", contractId)
      .order("due_date", { ascending: true }),
    supabase
      .from("payment_schedule")
      .select("month_year, expected_amount")
      .eq("contract_id", contractId)
      .order("due_date", { ascending: true }),
  ]);

  const allChecks = (checks || []) as Check[];
  const scheduleRows = schedule || [];
  const expectedTotal = scheduleRows.reduce((s, r) => s + Number(r.expected_amount), 0);

  // Active checks (not bounced, not cancelled)
  const activeChecks = allChecks.filter((c) => c.status === "pending" || c.status === "deposited");
  const receivedTotal = activeChecks.reduce((s, c) => s + Number(c.amount), 0);

  // Duplicates: by check_number
  const byNumber = new Map<string, Check[]>();
  for (const c of allChecks) {
    const arr = byNumber.get(c.check_number) || [];
    arr.push(c);
    byNumber.set(c.check_number, arr);
  }
  const duplicates: Check[] = [];
  for (const arr of byNumber.values()) {
    if (arr.length > 1) duplicates.push(...arr);
  }

  // Bounced
  const bounced = allChecks.filter((c) => c.status === "bounced");

  // Replacement pairs
  const byId = new Map(allChecks.map((c) => [c.id, c]));
  const replaced: { original: Check; replacement: Check }[] = [];
  for (const c of allChecks) {
    if (c.replacement_for && byId.has(c.replacement_for)) {
      replaced.push({ original: byId.get(c.replacement_for)!, replacement: c });
    }
  }

  // Months
  const checksByMonth = new Set(activeChecks.map((c) => c.for_month));
  const scheduleMonths = scheduleRows.map((r) => r.month_year);
  const monthsMissing = scheduleMonths.filter((m) => !checksByMonth.has(m));
  const monthsCovered = scheduleMonths.filter((m) => checksByMonth.has(m));

  return {
    expected_total: expectedTotal,
    received_total: receivedTotal,
    gap: expectedTotal - receivedTotal,
    months_covered: monthsCovered,
    months_missing: monthsMissing,
    duplicates,
    bounced,
    replaced,
  };
}

export function formatComparisonHe(r: CheckComparisonResult): string {
  let msg = `📑 השוואת צ'קים:\n`;
  msg += `• צפוי: ₪${r.expected_total.toLocaleString()}\n`;
  msg += `• התקבל: ₪${r.received_total.toLocaleString()}\n`;
  if (r.gap !== 0) {
    msg += `• פער: ₪${r.gap.toLocaleString()}\n`;
  }
  msg += `• חודשים מכוסים: ${r.months_covered.length}/${r.months_covered.length + r.months_missing.length}\n`;
  if (r.months_missing.length > 0) {
    msg += `• חסרים: ${r.months_missing.slice(0, 6).join(", ")}${r.months_missing.length > 6 ? "..." : ""}\n`;
  }
  if (r.bounced.length > 0) {
    msg += `• 🔴 חוזרים: ${r.bounced.length}\n`;
  }
  if (r.duplicates.length > 0) {
    msg += `• ⚠️ כפילויות: ${r.duplicates.length}\n`;
  }
  if (r.replaced.length > 0) {
    msg += `• 🔁 הוחלפו: ${r.replaced.length}\n`;
  }
  return msg;
}
