import { getBoss } from "./boss";
import { DAILY_ALERTS_JOB, handleDailyAlerts } from "./jobs/daily-alerts";

let started = false;

/**
 * Start the background worker.
 * Safe to call multiple times — only starts once.
 *
 * Currently runs inside the web service process.
 * To extract to a Render Background Worker later:
 *   1. Create a new file: worker.ts that imports and calls startWorker()
 *   2. Add a Background Worker in Render with command: node worker.js
 *   3. Remove the startWorker() call from instrumentation.ts
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

    await boss.work(DAILY_ALERTS_JOB, { teamSize: 1 }, async () => {
      await handleDailyAlerts();
    });

    // ── Schedule recurring jobs ──

    // Daily alerts at 05:00 UTC (08:00 Israel time)
    await boss.schedule(DAILY_ALERTS_JOB, "0 5 * * *", undefined, {
      tz: "Asia/Jerusalem",
    });

    console.log("[worker] Jobs registered: daily-alerts (08:00 Israel)");
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
