/**
 * Auto-apply Supabase SQL migrations on server boot.
 *
 * Reads `.sql` files from `supabase/migrations/` (sorted lexicographically),
 * applies each one inside a transaction, and records it in `schema_migrations`.
 * Already-applied files are skipped.
 *
 * Requires either `DATABASE_URL` or `MIGRATIONS_DATABASE_URL` — the Supabase
 * Postgres connection string (pooled is fine). Without one, the runner logs
 * a warning and exits cleanly, so boot is never blocked by missing config.
 *
 * Baseline: migrations 001-009 were applied manually before this runner
 * existed. On first boot, the runner marks them as applied without re-running
 * (controlled by BASELINE_THROUGH). Subsequent migrations are applied normally.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

// Last migration that was applied manually before this runner existed.
// Files alphabetically ≤ this are recorded as already-applied on first boot.
const BASELINE_THROUGH = "009_payment_category.sql";

function getConnectionString(): string | null {
  return (
    process.env.MIGRATIONS_DATABASE_URL ||
    process.env.DATABASE_URL ||
    null
  );
}

export async function runMigrations(): Promise<void> {
  const url = getConnectionString();
  if (!url) {
    console.warn(
      "[migrate] DATABASE_URL / MIGRATIONS_DATABASE_URL not set — skipping auto-migrations"
    );
    return;
  }

  let files: string[];
  try {
    const entries = await readdir(MIGRATIONS_DIR);
    files = entries.filter((f) => f.endsWith(".sql")).sort();
  } catch (err) {
    console.warn("[migrate] no migrations directory found", {
      dir: MIGRATIONS_DIR,
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }
  if (files.length === 0) {
    console.log("[migrate] no .sql files to apply");
    return;
  }

  // Supabase requires SSL. node-postgres infers from connection string in
  // most cases, but pooled connections sometimes need this hint.
  const client = new Client({
    connectionString: url,
    ssl: url.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });

  try {
    await client.connect();
  } catch (err) {
    console.error("[migrate] failed to connect — skipping", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows: appliedRows } = await client.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations"
    );
    const applied = new Set(appliedRows.map((r) => r.filename));

    // First boot: nothing applied yet → baseline historical migrations.
    if (applied.size === 0) {
      const baselineFiles = files.filter((f) => f <= BASELINE_THROUGH);
      if (baselineFiles.length > 0) {
        for (const f of baselineFiles) {
          await client.query(
            "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
            [f]
          );
          applied.add(f);
        }
        console.log(
          `[migrate] baselined ${baselineFiles.length} historical migration(s) (≤ ${BASELINE_THROUGH})`
        );
      }
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log(`[migrate] up to date (${files.length} applied)`);
      return;
    }

    console.log(`[migrate] applying ${pending.length} new migration(s)`);
    for (const filename of pending) {
      const sql = await readFile(join(MIGRATIONS_DIR, filename), "utf8");
      console.log(`[migrate] -> ${filename}`);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [filename]
        );
        await client.query("COMMIT");
        console.log(`[migrate] ✓ ${filename}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`[migrate] ✗ ${filename} — boot will continue but later migrations are skipped`, {
          error: err instanceof Error ? err.message : String(err),
        });
        // Abort the loop: applying a later migration on top of a failed
        // earlier one is almost always wrong.
        return;
      }
    }
    console.log("[migrate] all pending migrations applied");
  } finally {
    await client.end().catch(() => {});
  }
}
