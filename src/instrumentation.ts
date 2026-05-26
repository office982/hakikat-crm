export async function register() {
  // Only start the background worker in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("@/lib/worker");
    await startWorker();

    // Email retry loop runs in-process via setInterval — independent of
    // pg-boss/DATABASE_URL so it still works on Render where the background
    // worker is disabled.
    const { startEmailRetryLoop } = await import("@/lib/email-retry-loop");
    startEmailRetryLoop();
  }
}
