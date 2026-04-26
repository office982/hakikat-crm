import { supabase } from "@/lib/supabase";
import {
  createNotifications,
  notifyAdminUrgent,
  sendNotification,
  type NotificationInput,
} from "@/lib/notifications";
import { getReliabilityAlertThreshold } from "@/lib/reliability";

async function getPreDueDays(): Promise<number> {
  const { data } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "payment_reminder_days_before")
    .single();
  const n = Number(data?.value);
  return Number.isFinite(n) && n > 0 ? n : 3;
}

export const DAILY_ALERTS_JOB = "daily-alerts";

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function subDays(date: Date, days: number): string {
  return addDays(date, -days);
}

function formatMonthYear(date: Date): string {
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}

const URGENT_TYPES = new Set([
  "missing_payment",
  "contract_expiry_urgent",
  "check_bounced",
  "easydo_stuck",
  "low_reliability",
]);

/**
 * Daily alerts job — checks contracts, payments, checks, invoices,
 * EasyDo signing status, and reliability scores.
 */
export async function handleDailyAlerts() {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const notifications: NotificationInput[] = [];

  console.log(`[daily-alerts] Starting check at ${todayStr}`);

  // ── 1. Contracts expiring in 45 days ──
  const { data: expiring45 } = await supabase
    .from("contracts")
    .select("id, end_date, monthly_rent, tenant:tenants(full_name)")
    .eq("status", "active")
    .lte("end_date", addDays(today, 45))
    .gte("end_date", addDays(today, 31));

  for (const c of expiring45 || []) {
    const tenantName =
      (c.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
    notifications.push({
      type: "contract_expiry",
      entity_type: "contract",
      entity_id: c.id,
      title: `חוזה פג תוקף בעוד 45 יום — ${tenantName}`,
      message: `החוזה של ${tenantName} (₪${c.monthly_rent}/חודש) מסתיים ב-${c.end_date}. יש לטפל בחידוש.`,
      due_date: c.end_date,
    });
  }

  // ── 2. Contracts expiring in 30 days ──
  const { data: expiring30 } = await supabase
    .from("contracts")
    .select("id, end_date, monthly_rent, tenant:tenants(full_name)")
    .eq("status", "active")
    .lte("end_date", addDays(today, 30))
    .gte("end_date", todayStr);

  for (const c of expiring30 || []) {
    const tenantName =
      (c.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
    notifications.push({
      type: "contract_expiry_urgent",
      entity_type: "contract",
      entity_id: c.id,
      title: `🔴 חוזה פג בעוד פחות מ-30 יום — ${tenantName}`,
      message: `החוזה של ${tenantName} מסתיים ב-${c.end_date}! יש לחדש בדחיפות.`,
      due_date: c.end_date,
    });
  }

  // ── 3. Unpaid tenants (after 10th of month) ──
  if (today.getDate() >= 10) {
    const currentMonth = formatMonthYear(today);
    const { data: unpaid } = await supabase
      .from("payment_schedule")
      .select("id, tenant_id, expected_amount, tenant:tenants(full_name)")
      .eq("month_year", currentMonth)
      .in("status", ["pending", "overdue"]);

    for (const row of unpaid || []) {
      const tenantName =
        (row.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
      await supabase
        .from("payment_schedule")
        .update({ status: "overdue" })
        .eq("id", row.id)
        .eq("status", "pending");

      notifications.push({
        type: "missing_payment",
        entity_type: "tenant",
        entity_id: row.tenant_id,
        title: `תשלום חסר — ${tenantName}`,
        message: `${tenantName} לא שילם ₪${row.expected_amount} עבור ${currentMonth}.`,
      });
    }
  }

  // ── 3a. Pre-due payment reminders to tenants ──
  // Sends a WhatsApp reminder X days before due_date to every tenant
  // with a still-pending schedule row. Deduped per (tenant, month).
  const preDueDays = await getPreDueDays();
  const targetDateStr = addDays(today, preDueDays);
  const { data: preDueRows } = await supabase
    .from("payment_schedule")
    .select(
      "id, tenant_id, expected_amount, month_year, due_date, tenant:tenants(full_name, phone, whatsapp, email)"
    )
    .eq("status", "pending")
    .eq("due_date", targetDateStr);

  for (const row of preDueRows || []) {
    const tenant = row.tenant as unknown as {
      full_name: string;
      phone: string;
      whatsapp: string | null;
      email: string | null;
    } | null;
    if (!tenant?.phone) continue;

    // Idempotency — don't double-send for same (tenant, month).
    const { count: alreadySent } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("type", "payment_reminder_predue")
      .eq("entity_id", row.tenant_id)
      .gte("created_at", new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString());
    if ((alreadySent || 0) > 0) continue;

    const phoneForWati = (tenant.whatsapp || tenant.phone).replace(/^0/, "972");
    const msg =
      `שלום ${tenant.full_name}, תזכורת ידידותית: ` +
      `התשלום עבור ${row.month_year} (₪${Number(row.expected_amount).toLocaleString()}) ` +
      `מועד פירעון ${row.due_date}. ` +
      `תודה — קבוצת חקיקת.`;
    try {
      await sendNotification({
        type: "payment_reminder_predue",
        entity_type: "tenant",
        entity_id: row.tenant_id,
        title: `📨 תזכורת תשלום — ${tenant.full_name} (${row.month_year})`,
        message: msg,
        recipient: phoneForWati,
        channel: "whatsapp",
        email: tenant.email,
        sms: tenant.phone,
      });
    } catch (err) {
      console.error(`[daily-alerts] pre-due reminder for ${row.tenant_id} failed:`, err);
    }
  }

  // ── 4. Checks due in 7 days ──
  const { data: upcomingChecks } = await supabase
    .from("checks")
    .select("id, check_number, amount, due_date, tenant:tenants(full_name)")
    .eq("status", "pending")
    .lte("due_date", addDays(today, 7))
    .gte("due_date", todayStr);

  for (const check of upcomingChecks || []) {
    const tenantName =
      (check.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
    notifications.push({
      type: "check_due",
      entity_type: "check",
      entity_id: check.id,
      title: `צ'ק להפקדה — ${tenantName}`,
      message: `צ'ק #${check.check_number} (₪${check.amount}) של ${tenantName} — תאריך פירעון ${check.due_date}.`,
      due_date: check.due_date,
    });
  }

  // ── 4a. Bounced checks in the last 24h (urgent) ──
  const { data: newBounced } = await supabase
    .from("checks")
    .select("id, check_number, amount, for_month, tenant:tenants(full_name)")
    .eq("status", "bounced")
    .gte("bounced_at", addDays(today, -1));

  for (const check of newBounced || []) {
    const tenantName =
      (check.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
    notifications.push({
      type: "check_bounced",
      entity_type: "check",
      entity_id: check.id,
      title: `🔴 צ'ק חוזר — ${tenantName}`,
      message: `צ'ק #${check.check_number} (₪${check.amount}) של ${tenantName} עבור ${check.for_month} חזר. יש ליצור קשר לסידור התשלום.`,
    });
  }

  // ── 5. Unpaid supplier invoices > 30 days ──
  const { data: oldInvoices } = await supabase
    .from("project_expenses")
    .select("id, supplier_name, amount, invoice_date, project:projects(name)")
    .eq("status", "unpaid")
    .lte("invoice_date", subDays(today, 30));

  for (const inv of oldInvoices || []) {
    const projectName =
      (inv.project as unknown as Record<string, unknown>)?.name || "פרויקט";
    notifications.push({
      type: "supplier_overdue",
      entity_type: "project_expense",
      entity_id: inv.id,
      title: `חשבונית ספק לא שולמה — ${inv.supplier_name}`,
      message: `₪${inv.amount} ל${inv.supplier_name} (${projectName}) — מתאריך ${inv.invoice_date}, לא שולמה כבר 30+ יום.`,
    });
  }

  // ── 5a. EasyDo stuck: pending_signature for > 5 days ──
  const { data: stuck } = await supabase
    .from("contracts")
    .select("id, created_at, easydo_document_id, tenant:tenants(full_name)")
    .eq("status", "pending_signature")
    .lte("created_at", subDays(today, 5));

  for (const c of stuck || []) {
    const tenantName =
      (c.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
    const docRef = c.easydo_document_id ? ` (EasyDo ${c.easydo_document_id})` : "";
    notifications.push({
      type: "easydo_stuck",
      entity_type: "contract",
      entity_id: c.id,
      title: `🔴 חוזה תקוע בחתימה — ${tenantName}`,
      message: `החוזה של ${tenantName}${docRef} ממתין לחתימה מעל 5 ימים. יש לבדוק אצל הדייר או ב-EasyDo.`,
    });
  }

  // ── 5b. Low-reliability active tenants ──
  const threshold = await getReliabilityAlertThreshold();
  const { data: lowRel } = await supabase
    .from("tenants")
    .select("id, full_name, reliability_score")
    .eq("is_active", true)
    .lt("reliability_score", threshold);

  for (const t of lowRel || []) {
    notifications.push({
      type: "low_reliability",
      entity_type: "tenant",
      entity_id: t.id,
      title: `⚠️ דירוג אמינות נמוך — ${t.full_name}`,
      message: `הדירוג של ${t.full_name} הוא ${t.reliability_score}/100. ייתכן שצריך מעקב צמוד.`,
    });
  }

  // ── 6. Expire stale pending actions ──
  const { data: expiredCount } = await supabase.rpc("expire_pending_actions");

  // ── Save notifications (dedup + insert) ──
  const created = await createNotifications(notifications);

  // ── Admin WhatsApp summary for urgent items ──
  const urgent = notifications.filter((n) => URGENT_TYPES.has(n.type));
  await notifyAdminUrgent(urgent, notifications.length);

  console.log(
    `[daily-alerts] Done — ${created} notifications created, ${expiredCount || 0} pending actions expired`
  );

  return { notifications_found: notifications.length, created, expired: expiredCount || 0 };
}
