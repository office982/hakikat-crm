import { NextRequest, NextResponse } from "next/server";
import { enqueueJob } from "@/lib/worker";
import {
  WEEKLY_REPORT_JOB,
  MONTHLY_REPORT_JOB,
  handleWeeklyReport,
  handleMonthlyReport,
} from "@/lib/worker/jobs/whatsapp-reports";

/**
 * Manual / cron trigger for the WhatsApp reports jobs.
 *
 * GET /api/reports/whatsapp?kind=weekly   (default: weekly)
 * GET /api/reports/whatsapp?kind=monthly
 *
 * Protected by CRON_SECRET — use Authorization: Bearer <secret>.
 * If pg-boss is available the job is enqueued; otherwise runs inline.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get("kind") || "weekly";
  const jobName =
    kind === "monthly" ? MONTHLY_REPORT_JOB : WEEKLY_REPORT_JOB;
  const handler =
    kind === "monthly" ? handleMonthlyReport : handleWeeklyReport;

  try {
    const jobId = await enqueueJob(jobName, undefined, {
      singletonKey: `${kind}-${new Date().toISOString().split("T")[0]}`,
    });
    if (jobId) return NextResponse.json({ queued: true, jobId, kind });

    const result = await handler();
    return NextResponse.json({ ran_inline: true, kind, ...result });
  } catch (error) {
    console.error("whatsapp report error:", error);
    return NextResponse.json(
      { error: "Failed to trigger report" },
      { status: 500 }
    );
  }
}
