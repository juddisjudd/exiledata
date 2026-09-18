import pg from "pg";

/**
 * The slice of a Postgres client the API uses. `pg.Pool` is adapted to it in production;
 * tests pass PGlite, which satisfies it directly, so the same SQL runs in both.
 */
export interface Db {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  close?(): Promise<void>;
}

export function createPgDb(connectionString: string): Db {
  const pool = new pg.Pool({ connectionString, max: 5 });
  // An idle client losing its connection emits here; unhandled, it would crash the process.
  pool.on("error", (error) => console.error("postgres pool error:", error.message));

  return {
    async query<T>(text: string, params?: unknown[]) {
      const result = await pool.query(text, params);
      return { rows: result.rows as T[] };
    },
    close: () => pool.end()
  };
}
