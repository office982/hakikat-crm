import PgBoss from "pg-boss";

let boss: PgBoss | null = null;

/**
 * Get or create the pg-boss singleton.
 *
 * Requires DATABASE_URL — the direct Postgres connection from Supabase:
 *   postgresql://postgres.[ref]:[password]@db.[ref].supabase.co:5432/postgres
 *
 * Important: use the DIRECT connection (port 5432), not the pooled one (port 6543),
 * because pg-boss uses LISTEN/NOTIFY which requires a persistent connection.
 */
export function getBoss(): PgBoss {
  if (boss) return boss;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for the background worker");
  }

  boss = new PgBoss({
    connectionString,
    // Don't migrate on every start in production — run once manually
    migrate: true,
    // Maintenance runs every 2 minutes (expire jobs, archive old ones)
    maintenanceIntervalSeconds: 120,
    // Keep completed jobs for 7 days for debugging
    archiveCompletedAfterSeconds: 7 * 24 * 60 * 60,
    // Retry failed jobs up to 3 times
    retryLimit: 3,
    retryDelay: 60,
  });

  boss.on("error", (err) => {
    console.error("[pg-boss] Error:", err);
  });

  return boss;
}
