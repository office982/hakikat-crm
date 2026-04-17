import { PgBoss } from "pg-boss";

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
    // Apply pg-boss migrations on start; pg-boss skips when already current.
    migrate: true,
    // Maintenance runs every 2 minutes (expire jobs, archive old ones)
    maintenanceIntervalSeconds: 120,
  });

  boss.on("error", (err) => {
    console.error("[pg-boss] Error:", err);
  });

  return boss;
}
