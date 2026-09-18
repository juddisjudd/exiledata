import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/** The two calls the runner needs. Satisfied by a `pg.Client` adapter and by PGlite. */
export interface MigrationDb {
  /** Runs a script that may contain several statements. */
  exec(sql: string): Promise<void>;
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface MigrateOptions {
  /**
   * Marks every migration up to and including this file as applied without running it. For a
   * database whose earlier migrations were applied by hand before the runner existed.
   */
  baseline?: string;
  log?: (message: string) => void;
}

const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

/**
 * Applies pending `migrations/*.sql` files in name order, each in its own transaction, and
 * records them in `schema_migrations`. Returns the names it applied.
 *
 * Needs a single connection (not a pool), since BEGIN and COMMIT must reach the same session.
 */
export async function migrate(
  db: MigrationDb,
  dir: string,
  options: MigrateOptions = {}
): Promise<string[]> {
  const log = options.log ?? (() => {});
  const files = (await readdir(dir)).filter((name) => MIGRATION_FILE.test(name)).sort();

  if (options.baseline && !files.includes(options.baseline)) {
    throw new Error(`Baseline "${options.baseline}" is not a migration in ${dir}`);
  }

  await db.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`
  );

  const applied = new Set(
    (await db.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
      (row) => row.name
    )
  );

  if (options.baseline) {
    for (const name of files) {
      if (!applied.has(name)) {
        await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
        applied.add(name);
        log(`baselined ${name}`);
      }
      if (name === options.baseline) break;
    }
  }

  const ran: string[] = [];
  for (const name of files) {
    if (applied.has(name)) continue;

    const sql = await readFile(path.join(dir, name), "utf8");
    await db.exec("BEGIN");
    try {
      await db.exec(sql);
      await db.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
    }
    ran.push(name);
    log(`applied ${name}`);
  }

  return ran;
}
