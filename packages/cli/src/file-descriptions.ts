/**
 * One line per extract file for the downloads page and manifest, written from each file's actual
 * structure. Files missing here still publish, just without a description.
 */
export const FILE_DESCRIPTIONS: Record<string, string> = {
  active_skill_types: "Skill type ids that skills and supports use to match each other.",
  ascendancies: "Ascendancy classes with their parent class, art and flavour text.",
  attack_damage_scaling: "Damage multipliers for each attack scaling type.",
  audio: "NPC dialogue lines with the speaker and the audio file.",
  augments: "Socketable augments such as runes and soul cores: where they fit and what they grant.",
  base_items:
    "Every item base: class, tags, drop level, inventory size, implicits and requirements.",
  buff_visuals: "Visual effects attached to buffs.",
  buffs: "Buff and debuff definitions with name, description and stats.",
  character_constants: "Values shared by all characters, such as resistance and block caps.",
  characters: "Character classes and their base stats.",
  cluster_jewels: "Cluster jewel sizes and the passives they can add.",
  cost_types: "Skill cost types such as Mana and Life, and the stat each one uses.",
  crafting_bench_options: "Crafting bench recipes with tier and cost.",
  damage_calculation_types: "How each kind of hit is calculated, such as a main-hand attack.",
  default_monster_stats:
    "Base monster stats per level: life, accuracy, armour, damage, experience.",
  enchantments: "Enchantments grouped by type.",
  endgame_maps: "Endgame map areas with their monster packs and content.",
  essences: "Essences: tier, upgrade result and the mods they add.",
  flavour: "Flavour text by id.",
  game_constants: "Named numeric constants from the game.",
  gem_tags: "Gem tag ids and their display names.",
  item_classes: "Item classes with their category and display name.",
  jewel_slots: "Jewel sockets on the passive tree.",
  keywords: "Keyword terms and their in-game definitions.",
  level_scaling: "Values that scale with player and monster level.",
  liquid_emotions: "Distilled emotions: drop level and the mods they apply.",
  minion_stats: "Stats that pass from the player to minions.",
  mods: "Every modifier: domain, generation type, spawn weights, stats and tags.",
  mods_by_base: "The mod pool for each item class and tag set.",
  monsters: "Monster types: name, category, tags and stat multipliers.",
  pantheons: "Pantheon gods and the souls that upgrade them.",
  skill_gems: "Skill and support gems: base item, colour and the skills they grant.",
  skills: "Skill definitions with per-level stats, costs and cast times.",
  stat_value_handlers: "Rules that turn stat values into displayed numbers.",
  stats: "Every stat id with its flags, such as local or virtual.",
  stats_by_file: "Stat description text mapped to the stat ids and files that use it.",
  tag_details: "Tag ids with display names and whether crafting uses them.",
  tags: "Every tag id.",
  tattoos: "Tattoos: name, type and the passives they can replace.",
  timeless_jewels: "Timeless jewel data.",
  unique_details: "Unique items: name, class, flavour text and origin.",
  uniques: "Unique item art, inventory size and alternate-art flag.",
  weapon_passive_skills: "Weapon passive tree nodes with tier, type and tags.",
  world_areas: "Areas: act, level, bosses, connections and waypoints."
};

export const FOLDER_DESCRIPTIONS: Record<string, string> = {
  base_items: "Base items split into one file per item class.",
  passive_skill_trees: "Passive and atlas trees, one file per tree.",
  stat_translations: "Stat description files: how stats render as item and skill text.",
  normalized: "ExileData records in the documented record format."
};

export const NORMALIZED_DESCRIPTIONS: Record<string, string> = {
  base_items: "Base items as ExileData records: the data GET /v1/{game}/bases serves."
};
