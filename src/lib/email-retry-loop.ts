/**
 * In-process retry loop for `pending_emails`.
 *
 * Runs in the Next.js Node server (started from `instrumentation.ts`) every
 * 5 minutes. Independent of pg-boss / DATABASE_URL so it works on Render
 * even when the background-jobs worker is disabled.
 */

import { processPendingEmails } from "@/lib/api/email";

const INTERVAL_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;
let running = false;

async function tick(): Promise<void> {
  if (running) return; // skip overlapping runs
  running = true;
  try {
    const r = await processPendingEmails();
    if (r.processed > 0) {
      console.log("[email-retry] batch processed", r);
    }
  } catch (err) {
    console.error("[email-retry] tick failed", err);
  } finally {
    running = false;
  }
}

export function startEmailRetryLoop(): void {
  if (timer) return;
  console.log("[email-retry] loop starting (every 5 min)");
  // Fire once shortly after boot, then on the interval.
  setTimeout(() => {
    void tick();
  }, 10_000);
  timer = setInterval(() => {
    void tick();
  }, INTERVAL_MS);
}
