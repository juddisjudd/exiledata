import type {
  AdminCreateKeyResponse,
  AdminKey,
  AdminKeyResponse,
  AdminKeysResponse
} from "@exiledata/types";
import { printTable, shortTime } from "./format.js";

export interface AdminOptions {
  apiUrl?: string;
}

const DEFAULT_API_URL = "https://api.exiledata.dev";

/** Goes through the admin API so the key hashing secret stays on the server. */
async function admin<T>(options: AdminOptions, method: string, path: string, body?: unknown) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) throw new Error("ADMIN_TOKEN is not set.");

  const base = options.apiUrl ?? process.env.EXILEDATA_API_URL ?? DEFAULT_API_URL;
  const response = await fetch(new URL(`/admin/api${path}`, base), {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(
      `${method} ${base}/admin/api${path} failed: ${response.status} ${payload.message ?? ""}`
    );
  }
  return payload as T;
}

function printKeys(keys: AdminKey[]): void {
  if (keys.length === 0) {
    console.log("(no keys)");
    return;
  }
  printTable(
    ["ID", "CLIENT", "PREFIX", "LIMIT/MIN", "24H", "7D", "LAST USED (UTC)", "STATUS"],
    keys.map((key) => [
      key.id,
      key.clientName,
      `${key.prefix}…`,
      String(key.rateLimitPerMinute),
      String(key.requests24h),
      String(key.requests7d),
      shortTime(key.lastUsedAt),
      key.revokedAt ? `revoked ${shortTime(key.revokedAt)}` : "active"
    ])
  );
}

export async function listKeys(options: AdminOptions): Promise<void> {
  const { keys } = await admin<AdminKeysResponse>(options, "GET", "/keys");
  printKeys(keys);
}

export async function createKey(
  options: AdminOptions & { client: string; rateLimit?: string }
): Promise<void> {
  const rateLimitPerMinute =
    options.rateLimit === undefined ? undefined : Number(options.rateLimit);
  const { key, secret } = await admin<AdminCreateKeyResponse>(options, "POST", "/keys", {
    client: options.client,
    rateLimitPerMinute
  });

  printKeys([key]);
  console.log(`\nAPI key (shown once, store it now):\n${secret}`);
}

export async function revokeKey(options: AdminOptions & { id: string }): Promise<void> {
  const { key } = await admin<AdminKeyResponse>(options, "POST", `/keys/${options.id}/revoke`);
  printKeys([key]);
}

export async function setRateLimit(
  options: AdminOptions & { id: string; limit: string }
): Promise<void> {
  const { key } = await admin<AdminKeyResponse>(options, "PATCH", `/keys/${options.id}`, {
    rateLimitPerMinute: Number(options.limit)
  });
  printKeys([key]);
}
