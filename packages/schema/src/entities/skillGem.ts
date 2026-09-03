import type { CanonicalEntity } from "../common/entity.js";
import type { Skill } from "./skill.js";

/**
 * A skill gem grants one or more skills when socketed. Placeholder — does not yet model
 * gem levels, quality effects, or attribute requirements.
 */
export interface SkillGem extends CanonicalEntity {
  name: string;
  grantedSkillIds: Array<Skill["id"]>;
}
