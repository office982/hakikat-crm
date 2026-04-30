import {
  buildWeeklySummary,
  formatWeeklySummaryHe,
  buildMonthlySummary,
  formatMonthlySummaryHe,
  buildTenantMonthlySummary,
  formatTenantMonthlySummaryHe,
} from "@/lib/reports";
import { supabaseAdmin as supabase } from "@/lib/supabase";
import { sendNotification } from "@/lib/notifications";

export const WEEKLY_REPORT_JOB = "whatsapp-weekly-report";
export const MONTHLY_REPORT_JOB = "whatsapp-monthly-report";

/**
 * Weekly WhatsApp report — sent to the admin number every Sunday 08:00.
 */
export async function handleWeeklyReport(): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
  if (!adminPhone) return { sent: false, reason: "no_admin_phone" };

  const summary = await buildWeeklySummary();
  const msg = formatWeeklySummaryHe(summary);
  await sendNotification({
    type: "weekly_report",
    entity_type: "report",
    entity_id: "00000000-0000-0000-0000-000000000000",
    title: `📊 דוח שבועי`,
    message: msg,
    recipient: adminPhone,
    channel: "whatsapp",
  });

  console.log(
    `[weekly-report] sent — ${summary.payments_count} payments, ${summary.overdue_tenants.length} overdue`
  );
  return { sent: true };
}

function previousMonthYear(today = new Date()): string {
  const d = new Date(today);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/**
 * Monthly WhatsApp report.
 * Sends:
 *   1. Aggregate summary to admin.
 *   2. Per-tenant summary to every active tenant with a schedule
 *      row for the previous month — driven by the spec ("דוח חודשי
 *      ב-WhatsApp נשלח רק לאדמין, לא לכל דייר").
 */
export async function handleMonthlyReport(): Promise<{
  sent: boolean;
  admin_sent: boolean;
  tenants_sent: number;
  tenants_failed: number;
  reason?: string;
}> {
  const monthYear = previousMonthYear();
  const summary = await buildMonthlySummary(monthYear);
  if (!summary) {
    console.log(`[monthly-report] no data for ${monthYear} — skipping`);
    return { sent: false, admin_sent: false, tenants_sent: 0, tenants_failed: 0, reason: "no_data" };
  }

  // 1. Admin summary
  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
  let adminSent = false;
  if (adminPhone) {
    const msg = formatMonthlySummaryHe(summary);
    const res = await sendNotification({
      type: "monthly_report_admin",
      entity_type: "report",
      entity_id: "00000000-0000-0000-0000-000000000000",
      title: `📋 דוח חודשי ${monthYear}`,
      message: msg,
      recipient: adminPhone,
      channel: "whatsapp",
    });
    adminSent = res.sent;
  }

  // 2. Per-tenant summaries — every tenant with a schedule row for that month.
  const { data: scheduleRows } = await supabase
    .from("payment_schedule")
    .select("tenant_id")
    .eq("month_year", monthYear);

  const tenantIds = [...new Set((scheduleRows || []).map((r) => r.tenant_id))];

  let tenantsSent = 0;
  let tenantsFailed = 0;

  for (const tenantId of tenantIds) {
    try {
      const ts = await buildTenantMonthlySummary(tenantId, monthYear);
      if (!ts || ts.status === "no_schedule") continue;
      const phone = (ts.whatsapp || ts.phone || "").replace(/^0/, "972");
      if (!phone) {
        tenantsFailed++;
        continue;
      }
      const msg = formatTenantMonthlySummaryHe(ts);
      const res = await sendNotification({
        type: "monthly_report_tenant",
        entity_type: "tenant",
        entity_id: ts.tenant_id,
        title: `דוח חודשי ${ts.month_year} — ${ts.tenant_name}`,
        message: msg,
        recipient: phone,
        channel: "whatsapp",
      });
      if (res.sent) tenantsSent++;
      else tenantsFailed++;
    } catch (err) {
      console.error(`[monthly-report] tenant ${tenantId} failed:`, err);
      tenantsFailed++;
    }
  }

  console.log(
    `[monthly-report] ${monthYear}: admin=${adminSent}, tenants_sent=${tenantsSent}, tenants_failed=${tenantsFailed}`
  );

  return {
    sent: adminSent || tenantsSent > 0,
    admin_sent: adminSent,
    tenants_sent: tenantsSent,
    tenants_failed: tenantsFailed,
  };
}
