import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { migrate } from "../packages/cli/src/migrate.js";
import { MIGRATIONS_DIR, migrationDb } from "./helpers/app.js";

async function tableNames(db: PGlite): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`
  );
  return rows.map((row) => row.table_name);
}

describe("migrate", () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("applies the repository migrations in order and records them", async () => {
    const db = new PGlite();

    const applied = await migrate(migrationDb(db), MIGRATIONS_DIR);

    expect(applied).toEqual(["0001_initial.sql", "0002_api_key_auth.sql"]);
    expect(await tableNames(db)).toEqual([
      "api_clients",
      "api_key_usage_hourly",
      "api_keys",
      "schema_migrations"
    ]);
  });

  it("does nothing on a second run", async () => {
    const db = new PGlite();
    await migrate(migrationDb(db), MIGRATIONS_DIR);

    expect(await migrate(migrationDb(db), MIGRATIONS_DIR)).toEqual([]);
  });

  it("baselines migrations that were applied by hand", async () => {
    const db = new PGlite();
    await db.exec(await readFile(path.join(MIGRATIONS_DIR, "0001_initial.sql"), "utf8"));

    const applied = await migrate(migrationDb(db), MIGRATIONS_DIR, {
      baseline: "0001_initial.sql"
    });

    expect(applied).toEqual(["0002_api_key_auth.sql"]);
    const { rows } = await db.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY name"
    );
    expect(rows.map((row) => row.name)).toEqual(["0001_initial.sql", "0002_api_key_auth.sql"]);
  });

  it("rolls back a failing migration and leaves it pending", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "exiledata-migrations-"));
    await writeFile(path.join(dir, "0001_ok.sql"), "CREATE TABLE a (id INT);");
    await writeFile(
      path.join(dir, "0002_broken.sql"),
      "CREATE TABLE b (id INT); SELECT * FROM does_not_exist;"
    );
    const db = new PGlite();

    await expect(migrate(migrationDb(db), dir)).rejects.toThrow(/0002_broken\.sql failed/);

    expect(await tableNames(db)).toEqual(["a", "schema_migrations"]);
    const { rows } = await db.query<{ name: string }>("SELECT name FROM schema_migrations");
    expect(rows.map((row) => row.name)).toEqual(["0001_ok.sql"]);
  });

  it("rejects a baseline that is not a migration file", async () => {
    await expect(
      migrate(migrationDb(new PGlite()), MIGRATIONS_DIR, { baseline: "0009_nope.sql" })
    ).rejects.toThrow(/not a migration/);
  });
});
