import { NextRequest, NextResponse } from "next/server";
import { handleDailyAlerts } from "@/lib/worker/jobs/daily-alerts";
import { enqueueJob } from "@/lib/worker";
import { DAILY_ALERTS_JOB } from "@/lib/worker/jobs/daily-alerts";

/**
 * Manual trigger for the daily alerts check.
 *
 * - If pg-boss is running (DATABASE_URL set): enqueues a job
 * - Otherwise: runs the check inline
 *
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Try to enqueue via pg-boss
    const jobId = await enqueueJob(DAILY_ALERTS_JOB, undefined, {
      singletonKey: new Date().toISOString().split("T")[0], // once per day
    });

    if (jobId) {
      return NextResponse.json({ queued: true, jobId });
    }

    // Fallback: run inline if worker not available
    const result = await handleDailyAlerts();
    return NextResponse.json({ ran_inline: true, ...result });
  } catch (error) {
    console.error("Notification check error:", error);
    return NextResponse.json(
      { error: "Failed to check notifications" },
      { status: 500 }
    );
  }
}
