import { connect } from "node:net";
import type { Game } from "@exiledata/schema";

export interface PatchServer {
  host: string;
  port: number;
  hello: number[];
  /** Every patch of the game starts with this, so a reply for the other game is caught. */
  prefix: string;
}

/** GGG's patch servers, which the game client asks for the current patch before it starts. */
export const PATCH_SERVERS: Record<Game, PatchServer> = {
  poe1: { host: "patch.pathofexile.com", port: 12995, hello: [1, 6], prefix: "3." },
  poe2: { host: "patch.pathofexile2.com", port: 13060, hello: [1, 7], prefix: "4." }
};

/**
 * Reads the patch from a patch server reply: protocol byte 2, then after 33 bytes two
 * length-prefixed UTF-16LE strings, the second being the CDN folder of the current patch.
 */
export function parsePatchReply(data: Uint8Array): string {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data[0] !== 2) throw new Error(`unexpected patch protocol version ${data[0]}`);
  let pos = 33;
  let url = "";
  for (let i = 0; i < 2; i++) {
    const units = view.getUint16(pos);
    pos += 2;
    if (pos + units * 2 > data.byteLength) throw new Error("incomplete patch server reply");
    url = new TextDecoder("utf-16le").decode(data.subarray(pos, pos + units * 2));
    pos += units * 2;
  }
  const version = url.match(/poecdn\.com\/([\d.]+)\/?$/)?.[1];
  if (!version) throw new Error(`no version in patch server reply: ${url}`);
  return version;
}

/** Asks a game's patch server which patch is current, e.g. "4.5.5.3". */
export async function patchVersion(game: Game, server = PATCH_SERVERS[game]): Promise<string> {
  const version = await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let lastError: unknown = new Error(`${server.host} closed the connection without a reply`);
    const socket = connect({ host: server.host, port: server.port }, () => {
      socket.write(Uint8Array.from(server.hello));
    });
    const settle = (finish: () => void) => {
      clearTimeout(timer);
      socket.destroy();
      finish();
    };
    const timer = setTimeout(
      () => settle(() => reject(new Error(`${server.host} did not answer`))),
      10_000
    );
    socket.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
      try {
        const parsed = parsePatchReply(Buffer.concat(chunks));
        settle(() => resolve(parsed));
      } catch (error) {
        lastError = error;
      }
    });
    socket.on("error", (error) => settle(() => reject(error)));
    socket.on("close", () => settle(() => reject(lastError)));
  });
  if (!version.startsWith(server.prefix)) throw new Error(`unexpected ${game} version ${version}`);
  return version;
}
