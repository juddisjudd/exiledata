import path from "node:path";
import pg from "pg";
import { migrate } from "./migrate.js";

export async function runMigrations(options: { dir: string; baseline?: string }): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    const applied = await migrate(
      {
        exec: async (sql) => {
          await client.query(sql);
        },
        query: async <T>(text: string, params?: unknown[]) => {
          const result = await client.query(text, params);
          return { rows: result.rows as T[] };
        }
      },
      path.resolve(options.dir),
      { baseline: options.baseline, log: (message) => console.log(message) }
    );
    console.log(applied.length ? `Applied ${applied.length} migration(s).` : "Up to date.");
  } finally {
    await client.end();
  }
}
