import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/api/wati";

export type NotificationSeverity = "info" | "warning" | "urgent";

export interface NotificationInput {
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  message: string;
  due_date?: string;
  severity?: NotificationSeverity;
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Insert a notification, deduped by (type, entity_id, date).
 * Returns true if inserted, false if already existed today.
 */
export async function createNotification(n: NotificationInput): Promise<boolean> {
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("type", n.type)
    .eq("entity_id", n.entity_id)
    .gte("created_at", todayStr());

  if ((count || 0) > 0) return false;

  const { error } = await supabase.from("notifications").insert({
    type: n.type,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    title: n.title,
    message: n.message,
    due_date: n.due_date ?? null,
  });

  if (error) {
    console.error("createNotification insert failed:", error);
    return false;
  }
  return true;
}

/**
 * Insert many notifications, preserving dedup per row.
 * Returns the number newly inserted.
 */
export async function createNotifications(rows: NotificationInput[]): Promise<number> {
  let created = 0;
  for (const n of rows) {
    const inserted = await createNotification(n);
    if (inserted) created++;
  }
  return created;
}

/**
 * Send a summary of urgent notifications to the admin via WhatsApp.
 * Caller passes the notifications already created today.
 */
export async function notifyAdminUrgent(
  urgent: NotificationInput[],
  totalCount: number
): Promise<boolean> {
  const adminPhone = process.env.ADMIN_WHATSAPP_PHONE;
  if (!adminPhone || urgent.length === 0) return false;

  let summary = `📋 התראות יומיות (${todayStr()}):\n\n`;
  for (const n of urgent) summary += `• ${n.title}\n`;
  summary += `\nסה"כ ${totalCount} התראות. פתח את המערכת לפרטים.`;

  try {
    await sendWhatsAppMessage(adminPhone, summary);
    return true;
  } catch (err) {
    console.error("notifyAdminUrgent failed:", err);
    return false;
  }
}
