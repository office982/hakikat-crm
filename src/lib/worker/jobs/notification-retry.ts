import { retryFailedNotifications } from "@/lib/notifications";

export const NOTIFICATION_RETRY_JOB = "notification-retry";

/**
 * Retry failed notification deliveries (whatsapp/email/sms).
 * Runs every 30 minutes, capped at 5 retries per notification.
 */
export async function handleNotificationRetry() {
  const { attempted, succeeded } = await retryFailedNotifications();
  console.log(
    `[notification-retry] attempted=${attempted}, succeeded=${succeeded}`
  );
  return { attempted, succeeded };
}
