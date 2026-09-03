import type { Env } from "./worker-env.js";

/**
 * Cloudflare Worker entrypoint for apps/docs. Mirrors src/server.ts's local-dev behavior
 * (URL slug -> `content/{slug}.md`) but serves the `content/` directory via the Workers
 * static assets binding instead of the filesystem.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const slug = url.pathname.replace(/^\/+/, "") || "index";
    const assetRequest = new Request(new URL(`/${slug}.md`, url), request);
    const response = await env.ASSETS.fetch(assetRequest);

    if (response.status === 404) {
      return new Response(`Not found: ${slug}`, { status: 404 });
    }

    return response;
  }
};
