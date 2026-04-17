import {
  buildWeeklySummary,
  formatWeeklySummaryHe,
  buildMonthlySummary,
  formatMonthlySummaryHe,
} from "@/lib/reports";
import { sendWhatsAppMessage } from "@/lib/api/wati";

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
  await sendWhatsAppMessage(adminPhone, msg);

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
 * Monthly WhatsApp report — sent on the 1st of each month for the previous month.
 */
export async function handleMonthlyReport(): Promise<{
  sent: boolean;
  reason?: string;
}> {
  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
  if (!adminPhone) return { sent: false, reason: "no_admin_phone" };

  const monthYear = previousMonthYear();
  const summary = await buildMonthlySummary(monthYear);
  if (!summary) {
    console.log(`[monthly-report] no data for ${monthYear} — skipping`);
    return { sent: false, reason: "no_data" };
  }

  const msg = formatMonthlySummaryHe(summary);
  await sendWhatsAppMessage(adminPhone, msg);

  console.log(
    `[monthly-report] sent — ${monthYear}, collected ₪${summary.total_paid.toLocaleString()}`
  );
  return { sent: true };
}
