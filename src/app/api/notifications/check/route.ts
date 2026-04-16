import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/api/wati";

/**
 * Notification Check — Cron Job
 * Runs daily at 08:00 Israel time.
 *
 * Setup in Render: create a Cron Job service that runs:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://your-app.onrender.com/api/notifications/check
 *
 * Checks:
 * 1. Contracts expiring in 45 days
 * 2. Contracts expiring in 30 days
 * 3. Tenants who haven't paid by the 10th
 * 4. Checks due in next 7 days
 * 5. Supplier invoices unpaid over 30 days
 * 6. Expire stale pending actions
 */

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

interface NotificationRow {
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  message: string;
  due_date?: string;
}

export async function GET(request: NextRequest) {
  // Auth: require CRON_SECRET header or allow Vercel cron
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const notifications: NotificationRow[] = [];
    const adminPhone = process.env.ADMIN_WHATSAPP_PHONE || "";

    // ── 1. Contracts expiring in 45 days ──
    const { data: expiring45 } = await supabase
      .from("contracts")
      .select("id, end_date, monthly_rent, tenant:tenants(full_name)")
      .eq("status", "active")
      .lte("end_date", addDays(today, 45))
      .gte("end_date", addDays(today, 31));

    for (const c of expiring45 || []) {
      const tenantName = (c.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
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
      const tenantName = (c.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
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
        const tenantName = (row.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
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

    // ── 4. Checks due in 7 days ──
    const { data: upcomingChecks } = await supabase
      .from("checks")
      .select("id, check_number, amount, due_date, tenant:tenants(full_name)")
      .eq("status", "pending")
      .lte("due_date", addDays(today, 7))
      .gte("due_date", todayStr);

    for (const check of upcomingChecks || []) {
      const tenantName = (check.tenant as unknown as Record<string, unknown>)?.full_name || "דייר";
      notifications.push({
        type: "check_due",
        entity_type: "check",
        entity_id: check.id,
        title: `צ'ק להפקדה — ${tenantName}`,
        message: `צ'ק #${check.check_number} (₪${check.amount}) של ${tenantName} — תאריך פירעון ${check.due_date}.`,
        due_date: check.due_date,
      });
    }

    // ── 5. Unpaid supplier invoices > 30 days ──
    const { data: oldInvoices } = await supabase
      .from("project_expenses")
      .select("id, supplier_name, amount, invoice_date, project:projects(name)")
      .eq("status", "unpaid")
      .lte("invoice_date", subDays(today, 30));

    for (const inv of oldInvoices || []) {
      const projectName = (inv.project as unknown as Record<string, unknown>)?.name || "פרויקט";
      notifications.push({
        type: "supplier_overdue",
        entity_type: "project_expense",
        entity_id: inv.id,
        title: `חשבונית ספק לא שולמה — ${inv.supplier_name}`,
        message: `₪${inv.amount} ל${inv.supplier_name} (${projectName}) — מתאריך ${inv.invoice_date}, לא שולמה כבר 30+ יום.`,
      });
    }

    // ── 6. Expire stale pending actions ──
    const { data: expiredCount } = await supabase.rpc("expire_pending_actions");

    // ── Save notifications (with deduplication) ──
    let created = 0;
    for (const n of notifications) {
      // Check if same notification was already created today
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", n.type)
        .eq("entity_id", n.entity_id)
        .gte("created_at", todayStr);

      if ((count || 0) === 0) {
        await supabase.from("notifications").insert(n);
        created++;
      }
    }

    // ── Send urgent alerts to admin via WhatsApp ──
    if (adminPhone) {
      const urgent = notifications.filter(
        (n) => n.type === "missing_payment" || n.type === "contract_expiry_urgent"
      );
      if (urgent.length > 0) {
        let summary = `📋 התראות יומיות (${todayStr}):\n\n`;
        for (const n of urgent) {
          summary += `• ${n.title}\n`;
        }
        summary += `\nסה"כ ${notifications.length} התראות. פתח את המערכת לפרטים.`;
        await sendWhatsAppMessage(adminPhone, summary);
      }
    }

    console.log(
      `[Cron] ${todayStr} — ${created} notifications created, ${expiredCount || 0} pending actions expired`
    );

    return NextResponse.json({
      checked_at: today.toISOString(),
      notifications_found: notifications.length,
      notifications_created: created,
      pending_expired: expiredCount || 0,
    });
  } catch (error) {
    console.error("Notification check error:", error);
    return NextResponse.json(
      { error: "Failed to check notifications" },
      { status: 500 }
    );
  }
}
