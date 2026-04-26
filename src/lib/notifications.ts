import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/api/wati";
import { sendEmail } from "@/lib/api/email";
import { sendSms } from "@/lib/api/sms";

export type NotificationSeverity = "info" | "warning" | "urgent";
export type NotificationChannel = "whatsapp" | "email" | "sms" | "push";

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
 * Insert a per-action notification (no dedup). Use this for events that
 * happen at most once per object (e.g. contract sent, payment recorded,
 * property added) rather than recurring alerts.
 */
export async function notifyAction(n: {
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  message?: string;
}): Promise<void> {
  await supabase.from("notifications").insert({
    type: n.type,
    entity_type: n.entity_type,
    entity_id: n.entity_id,
    title: n.title,
    message: n.message ?? null,
  });
}

// ─── Channel-aware send + delivery tracking ───────────────────────

interface DeliverArgs {
  channel: NotificationChannel;
  recipient: string;
  title: string;
  message: string;
}

async function deliverOnce(args: DeliverArgs): Promise<{ ok: boolean; error?: string }> {
  try {
    if (args.channel === "whatsapp") {
      await sendWhatsAppMessage(args.recipient, args.message);
      return { ok: true };
    }
    if (args.channel === "email") {
      const r = await sendEmail({ to: args.recipient, subject: args.title, text: args.message });
      return { ok: r.ok, error: r.error };
    }
    if (args.channel === "sms") {
      const r = await sendSms({ to: args.recipient, body: args.message });
      return { ok: r.ok, error: r.error };
    }
    return { ok: false, error: `unsupported channel: ${args.channel}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

async function getFallbackChannels(): Promise<NotificationChannel[]> {
  const { data } = await supabase
    .from("settings")
    .select("key, value")
    .in("key", ["notification_email_enabled", "notification_sms_enabled"]);
  const map = new Map<string, string>();
  for (const row of data || []) map.set(row.key, row.value || "");
  const out: NotificationChannel[] = [];
  if (map.get("notification_email_enabled") === "true") out.push("email");
  if (map.get("notification_sms_enabled") === "true") out.push("sms");
  return out;
}

export interface SendNotificationParams {
  type: string;
  entity_type: string;
  entity_id: string;
  title: string;
  message: string;
  recipient: string;
  channel?: NotificationChannel;
  /** Email/SMS recipient if different from primary channel (e.g. tenant.email) */
  email?: string | null;
  sms?: string | null;
  due_date?: string;
}

export interface SendNotificationResult {
  notification_id: string | null;
  sent: boolean;
  channel_used?: NotificationChannel;
  error?: string;
}

/**
 * Persist a notification + attempt delivery.
 * - Tracks delivery status (sent/failed), timestamp, retry_count.
 * - Records every attempt in notification_attempts (audit trail).
 * - On primary failure, falls back to email/sms if enabled in settings.
 */
export async function sendNotification(
  params: SendNotificationParams
): Promise<SendNotificationResult> {
  const channel: NotificationChannel = params.channel || "whatsapp";

  const { data: inserted, error: insertErr } = await supabase
    .from("notifications")
    .insert({
      type: params.type,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      title: params.title,
      message: params.message,
      due_date: params.due_date ?? null,
      recipient: params.recipient,
      channel,
      delivery_status: "pending",
      retry_count: 0,
    })
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("sendNotification: insert failed:", insertErr);
    return { notification_id: null, sent: false, error: insertErr?.message };
  }
  const notificationId = inserted.id as string;

  // Primary attempt
  const primary = await deliverOnce({
    channel,
    recipient: params.recipient,
    title: params.title,
    message: params.message,
  });

  await supabase.from("notification_attempts").insert({
    notification_id: notificationId,
    channel,
    recipient: params.recipient,
    status: primary.ok ? "sent" : "failed",
    error: primary.error || null,
  });

  if (primary.ok) {
    await supabase
      .from("notifications")
      .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
      .eq("id", notificationId);
    return { notification_id: notificationId, sent: true, channel_used: channel };
  }

  // Fallbacks (email then sms — only ones the user enabled in settings).
  const fallbacks = (await getFallbackChannels()).filter((c) => c !== channel);
  for (const fb of fallbacks) {
    const recipient = fb === "email" ? params.email : params.sms;
    if (!recipient) continue;
    const r = await deliverOnce({
      channel: fb,
      recipient,
      title: params.title,
      message: params.message,
    });
    await supabase.from("notification_attempts").insert({
      notification_id: notificationId,
      channel: fb,
      recipient,
      status: r.ok ? "sent" : "failed",
      error: r.error || null,
    });
    if (r.ok) {
      await supabase
        .from("notifications")
        .update({
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
          channel: fb,
          recipient,
        })
        .eq("id", notificationId);
      return { notification_id: notificationId, sent: true, channel_used: fb };
    }
  }

  // All channels failed — mark for retry.
  await supabase
    .from("notifications")
    .update({
      delivery_status: "failed",
      failed_at: new Date().toISOString(),
      retry_count: 1,
      last_error: primary.error || "all channels failed",
    })
    .eq("id", notificationId);

  return {
    notification_id: notificationId,
    sent: false,
    error: primary.error || "all channels failed",
  };
}

/**
 * Retry pending/failed notifications. Run by a worker job.
 * Stops retrying after 5 attempts.
 */
export async function retryFailedNotifications(): Promise<{
  attempted: number;
  succeeded: number;
}> {
  const { data: rows } = await supabase
    .from("notifications")
    .select("id, type, entity_type, entity_id, title, message, channel, recipient, retry_count")
    .eq("delivery_status", "failed")
    .lt("retry_count", 5)
    .order("created_at", { ascending: true })
    .limit(50);

  let attempted = 0;
  let succeeded = 0;

  for (const n of rows || []) {
    if (!n.recipient || !n.channel) continue;
    attempted++;
    const r = await deliverOnce({
      channel: n.channel as NotificationChannel,
      recipient: n.recipient,
      title: n.title,
      message: n.message ?? n.title,
    });

    await supabase.from("notification_attempts").insert({
      notification_id: n.id,
      channel: n.channel,
      recipient: n.recipient,
      status: r.ok ? "sent" : "failed",
      error: r.error || null,
    });

    if (r.ok) {
      succeeded++;
      await supabase
        .from("notifications")
        .update({ delivery_status: "sent", sent_at: new Date().toISOString() })
        .eq("id", n.id);
    } else {
      await supabase
        .from("notifications")
        .update({
          retry_count: (n.retry_count || 0) + 1,
          failed_at: new Date().toISOString(),
          last_error: r.error || "retry failed",
        })
        .eq("id", n.id);
    }
  }

  return { attempted, succeeded };
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

  const res = await sendNotification({
    type: "daily_admin_summary",
    entity_type: "report",
    entity_id: "00000000-0000-0000-0000-000000000000",
    title: `התראות יומיות (${todayStr()})`,
    message: summary,
    recipient: adminPhone,
    channel: "whatsapp",
    email: process.env.ADMIN_EMAIL || null,
    sms: process.env.ADMIN_SMS_PHONE || null,
  });
  return res.sent;
}
