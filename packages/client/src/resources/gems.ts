import type { Game, SkillGem } from "@exiledata/types";
import type { HttpClient } from "../http.js";
import { ListResource } from "./list-resource.js";

export class GemsResource extends ListResource<SkillGem> {
  constructor(http: HttpClient, game: Game) {
    super(http, `/v1/${game}/gems`);
  }
}
