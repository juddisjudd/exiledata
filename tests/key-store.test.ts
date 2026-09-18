import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { KeyStore } from "../apps/api/src/auth/key-store.js";
import { UsageRecorder } from "../apps/api/src/auth/usage.js";
import { createTestDb, issueKey } from "./helpers/app.js";

describe("KeyStore usage", () => {
  let db: PGlite;
  let store: KeyStore;

  beforeEach(async () => {
    db = await createTestDb();
    store = new KeyStore(db, () => new Date("2026-09-18T12:30:00Z"));
  });

  afterEach(async () => {
    await db.close();
  });

  it("sets last use to the newest entry when a batch spans several hours", async () => {
    const { id } = await issueKey(db);

    await store.recordUsage([
      {
        keyId: id,
        hour: "2026-09-18T11:00:00.000Z",
        requests: 1,
        errors: 0,
        lastUsedAt: "2026-09-18T11:59:00.000Z"
      },
      {
        keyId: id,
        hour: "2026-09-18T12:00:00.000Z",
        requests: 1,
        errors: 0,
        lastUsedAt: "2026-09-18T12:05:00.000Z"
      },
      {
        keyId: id,
        hour: "2026-09-18T10:00:00.000Z",
        requests: 1,
        errors: 0,
        lastUsedAt: "2026-09-18T10:10:00.000Z"
      }
    ]);

    expect((await store.getKey(id))?.lastUsedAt).toBe("2026-09-18T12:05:00.000Z");
  });

  it("never moves last use backwards", async () => {
    const { id } = await issueKey(db);
    const entry = { keyId: id, hour: "2026-09-18T12:00:00.000Z", requests: 1, errors: 0 };

    await store.recordUsage([{ ...entry, lastUsedAt: "2026-09-18T12:20:00.000Z" }]);
    await store.recordUsage([{ ...entry, lastUsedAt: "2026-09-18T12:10:00.000Z" }]);

    expect((await store.getKey(id))?.lastUsedAt).toBe("2026-09-18T12:20:00.000Z");
  });

  it("adds to an existing hour instead of replacing it", async () => {
    const { id } = await issueKey(db);
    const entry = {
      keyId: id,
      hour: "2026-09-18T12:00:00.000Z",
      requests: 2,
      errors: 1,
      lastUsedAt: "2026-09-18T12:10:00.000Z"
    };

    await store.recordUsage([entry]);
    await store.recordUsage([entry]);

    expect(
      await store.usage(new Date("2026-09-18T00:00:00Z"), new Date("2026-09-19T00:00:00Z"))
    ).toEqual([{ keyId: id, hour: "2026-09-18T12:00:00.000Z", requests: 4, errors: 2 }]);
  });

  it("splits 24-hour and 7-day totals", async () => {
    const { id } = await issueKey(db);
    const at = (hour: string, requests: number) => ({
      keyId: id,
      hour,
      requests,
      errors: 0,
      lastUsedAt: hour
    });

    await store.recordUsage([
      at("2026-09-18T12:00:00.000Z", 5),
      at("2026-09-17T13:00:00.000Z", 3),
      at("2026-09-17T12:00:00.000Z", 7),
      at("2026-09-11T13:00:00.000Z", 11),
      at("2026-09-11T12:00:00.000Z", 100)
    ]);

    expect(await store.getKey(id)).toMatchObject({ requests24h: 8, requests7d: 26 });
  });
});

describe("UsageRecorder", () => {
  it("keeps counts that failed to write and retries them on the next flush", async () => {
    let fail = true;
    const written: unknown[] = [];
    const store = {
      recordUsage: async (entries: unknown[]) => {
        if (fail) throw new Error("db down");
        written.push(...entries);
      }
    } as unknown as KeyStore;
    const recorder = new UsageRecorder(store);
    const at = new Date("2026-09-18T12:30:00Z");

    recorder.record("k", 200, at);
    await expect(recorder.flush()).rejects.toThrow("db down");
    recorder.record("k", 500, at);
    fail = false;
    await recorder.flush();

    expect(written).toEqual([
      {
        keyId: "k",
        hour: "2026-09-18T12:00:00.000Z",
        requests: 2,
        errors: 1,
        lastUsedAt: "2026-09-18T12:30:00.000Z"
      }
    ]);
  });
});
