export interface RequestOptions {
  signal?: AbortSignal;
}

/**
 * Minimal internal HTTP helper. Deliberately thin — no retry/backoff/caching logic yet.
 */
export class HttpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: "GET",
      headers: { "x-api-key": this.apiKey },
      signal: options?.signal
    });

    if (!response.ok) {
      throw new Error(`ExileData API request failed: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }
}
