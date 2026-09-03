import type { FastifyPluginAsync } from "fastify";

type GameParam = { game: string };

/**
 * Placeholder routes for the eventual per-game data endpoints:
 *   GET /v1/{game}/items | /bases | /mods | /gems | /skills
 *
 * Not implemented yet — no dataset exists to serve. Returns 501 rather than fabricated data.
 */
const gameDataRoutes: FastifyPluginAsync = async (app) => {
  const resources = ["items", "bases", "mods", "gems", "skills"] as const;

  for (const resource of resources) {
    app.get<{ Params: GameParam }>(`/v1/:game/${resource}`, async (request, reply) => {
      return reply.code(501).send({
        error: "not_implemented",
        message: `GET /v1/${request.params.game}/${resource} is not implemented yet`
      });
    });
  }
};

export default gameDataRoutes;
