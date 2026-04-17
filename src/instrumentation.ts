export async function register() {
  // Only start the background worker in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startWorker } = await import("@/lib/worker");
    await startWorker();
  }
}
