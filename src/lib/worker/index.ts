import { getBoss } from "./boss";
import { DAILY_ALERTS_JOB, handleDailyAlerts } from "./jobs/daily-alerts";
import {
  WEEKLY_REPORT_JOB,
  MONTHLY_REPORT_JOB,
  handleWeeklyReport,
  handleMonthlyReport,
} from "./jobs/whatsapp-reports";
import {
  RELIABILITY_RECOMPUTE_JOB,
  handleReliabilityRecompute,
} from "./jobs/reliability-recompute";
import { DRIVE_BACKUP_JOB, handleDriveBackup } from "./jobs/drive-backup";
import { ONEDRIVE_BACKUP_JOB, handleOneDriveBackup } from "./jobs/onedrive-backup";
import {
  NOTIFICATION_RETRY_JOB,
  handleNotificationRetry,
} from "./jobs/notification-retry";

let started = false;

/**
 * Start the background worker.
 * Safe to call multiple times — only starts once.
 */
export async function startWorker() {
  if (started) return;
  if (!process.env.DATABASE_URL) {
    console.warn("[worker] DATABASE_URL not set — background worker disabled");
    return;
  }

  started = true;
  const boss = getBoss();

  try {
    await boss.start();
    console.log("[worker] pg-boss started");

    // ── Register job handlers ──
    await boss.work(DAILY_ALERTS_JOB, { localConcurrency: 1 }, async () => {
      await handleDailyAlerts();
    });

    await boss.work(WEEKLY_REPORT_JOB, { localConcurrency: 1 }, async () => {
      await handleWeeklyReport();
    });

    await boss.work(MONTHLY_REPORT_JOB, { localConcurrency: 1 }, async () => {
      await handleMonthlyReport();
    });

    await boss.work(RELIABILITY_RECOMPUTE_JOB, { localConcurrency: 1 }, async () => {
      await handleReliabilityRecompute();
    });

    await boss.work(DRIVE_BACKUP_JOB, { localConcurrency: 1 }, async () => {
      await handleDriveBackup();
    });

    await boss.work(ONEDRIVE_BACKUP_JOB, { localConcurrency: 1 }, async () => {
      await handleOneDriveBackup();
    });

    await boss.work(NOTIFICATION_RETRY_JOB, { localConcurrency: 1 }, async () => {
      await handleNotificationRetry();
    });

    // ── Schedule recurring jobs (all in Asia/Jerusalem) ──
    // Daily 08:00 — alerts
    await boss.schedule(DAILY_ALERTS_JOB, "0 8 * * *", undefined, {
      tz: "Asia/Jerusalem",
    });

    // Nightly 02:30 — reliability recompute
    await boss.schedule(RELIABILITY_RECOMPUTE_JOB, "30 2 * * *", undefined, {
      tz: "Asia/Jerusalem",
    });

    // Sunday 08:15 — weekly report
    await boss.schedule(WEEKLY_REPORT_JOB, "15 8 * * 0", undefined, {
      tz: "Asia/Jerusalem",
    });

    // 1st of month 08:30 — monthly report
    await boss.schedule(MONTHLY_REPORT_JOB, "30 8 1 * *", undefined, {
      tz: "Asia/Jerusalem",
    });

    // Sunday 03:00 — drive backup
    await boss.schedule(DRIVE_BACKUP_JOB, "0 3 * * 0", undefined, {
      tz: "Asia/Jerusalem",
    });

    // Sunday 03:30 — OneDrive backup (parallel to Google Drive; gated
    // by `onedrive_backup_enabled` setting + ONEDRIVE_REFRESH_TOKEN env)
    await boss.schedule(ONEDRIVE_BACKUP_JOB, "30 3 * * 0", undefined, {
      tz: "Asia/Jerusalem",
    });

    // Every 30 minutes — retry failed notification deliveries
    await boss.schedule(NOTIFICATION_RETRY_JOB, "*/30 * * * *", undefined, {
      tz: "Asia/Jerusalem",
    });

    console.log(
      "[worker] Jobs registered: daily-alerts, weekly-report, monthly-report, reliability-recompute, drive-backup, onedrive-backup, notification-retry"
    );
  } catch (err) {
    console.error("[worker] Failed to start:", err);
    started = false;
  }
}

/**
 * Enqueue a job manually (e.g. from an API route).
 */
export async function enqueueJob(
  name: string,
  data?: Record<string, unknown>,
  options?: { singletonKey?: string; retryLimit?: number; startAfter?: number }
) {
  if (!process.env.DATABASE_URL) {
    console.warn(`[worker] Cannot enqueue "${name}" — DATABASE_URL not set`);
    return null;
  }

  const boss = getBoss();
  return boss.send(name, data || {}, {
    singletonKey: options?.singletonKey,
    retryLimit: options?.retryLimit ?? 3,
    startAfter: options?.startAfter,
  });
}
