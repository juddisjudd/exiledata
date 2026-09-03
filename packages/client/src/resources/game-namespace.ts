import type { Game, Item, BaseItem, Modifier, Skill } from "@exiledata/types";
import type { HttpClient } from "../http.js";
import { ListResource } from "./list-resource.js";
import { GemsResource } from "./gems.js";

/**
 * Per-game namespace, e.g. `client.poe2.gems.list()`. Establishes the shape for all
 * resource types; only `gems` is wired to a concrete resource class so far.
 */
export class GameNamespace {
  readonly items: ListResource<Item>;
  readonly bases: ListResource<BaseItem>;
  readonly mods: ListResource<Modifier>;
  readonly gems: GemsResource;
  readonly skills: ListResource<Skill>;

  constructor(http: HttpClient, game: Game) {
    this.items = new ListResource<Item>(http, `/v1/${game}/items`);
    this.bases = new ListResource<BaseItem>(http, `/v1/${game}/bases`);
    this.mods = new ListResource<Modifier>(http, `/v1/${game}/mods`);
    this.gems = new GemsResource(http, game);
    this.skills = new ListResource<Skill>(http, `/v1/${game}/skills`);
  }
}
