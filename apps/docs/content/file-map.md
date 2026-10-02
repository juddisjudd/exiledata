# File map

## Path of Exile 2

<!-- file-map poe2 -->

## Path of Exile 1

<!-- file-map poe1 -->

## Raw units

| Field                                                     | Unit                          | Example                                           |
| --------------------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| `properties.attack_time`                                  | Milliseconds per attack       | 690 → 1.45 attacks per second                     |
| `properties.critical_strike_chance`, `static.crit_chance` | Hundredths of a percent       | 700 → 7.00%                                       |
| `properties.range`                                        | Tenths of a metre             | 11 → 1.1 metres                                   |
| `skills.cast_time`                                        | Milliseconds                  | 700 → 0.70 sec                                    |
| `per_level.costs` with a per-minute cost type             | Per minute                    | Divide by `cost_types[key].divisor`, 60           |
| `monsters.life_multiplier`, `damage_multiplier`           | Percent of the level baseline | 105 → 105% of `default_monster_stats[level].life` |
