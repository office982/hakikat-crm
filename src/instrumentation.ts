export async function register() {
  // Only start the background worker in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Apply any pending SQL migrations first so schema is ready before the
    // worker / email loop touch the DB. Runner skips itself when
    // DATABASE_URL isn't set, so boot is never blocked by missing config.
    const { runMigrations } = await import("@/lib/migrate");
    try {
      await runMigrations();
    } catch (err) {
      console.error("[instrumentation] migrate threw — continuing boot", err);
    }

    const { startWorker } = await import("@/lib/worker");
    await startWorker();

    // Email retry loop runs in-process via setInterval — independent of
    // pg-boss/DATABASE_URL so it still works on Render where the background
    // worker is disabled.
    const { startEmailRetryLoop } = await import("@/lib/email-retry-loop");
    startEmailRetryLoop();
  }
}
