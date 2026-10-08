# ZY Skill Game: Design Plan (v0.2 draft)

> A browser game inspired by Ultima Online and the Czech/Slovak shard **Andaria**,
> playable offline in one tab. Each character has one profession: Craftsman,
> Warrior or Ranger. Skills go from 0.0 to 100.0 in 0.1 steps, growing quickly
> at first and slowly later. Dungeons work like a roguelike with turn-based
> combat, and an NPC economy connects the professions.

### Decisions so far
| # | Question | Decision |
|---|---|---|
| 1 | One path or several? | **The profession is chosen per character.** A save holds several character slots (like Andaria's account slots), and characters share a **bank** |
| 2 | Skill cap | **700 total**, plus a **per-profession maximum for each skill** (Andaria style, section 3.2) |
| 3 | Combat | **Turn-based** (section 6.2) |
| 4 | Visual style | **C: Parchment Ledger**. Parchment cards with stone/brass frames, a serif hand, engraved resource art, and a journal log. Works on a phone first. Mockups: https://claude.ai/artifact/XngUSRF87vZqNitUk78YiM |
| 5 | Inspiration | UO (base mechanics) + **Andaria** (races, professions, skill maximums, ores, stances, dungeon ratings, goblin-held mines) |
| 6 | Repo / URL | Keep `ZY_SkillGame` → `https://lukasgreg.github.io/ZY_SkillGame/` |
| 7 | Language | **English + Czech** from day one (section 1, i18n) |
| 8 | Setting | Our own world, the **Kingdom of Ardenhal** (section 12) |
| 9 | Durability | **Every tool, weapon and armor piece wears out, and breaks for good if not repaired** (section 4b) |

### Build status (2026-10-08)
| Milestone | Status |
|---|---|
| M0 Scaffold, deploy workflow, save/export, EN/CZ | Done |
| M1 Skill engine, stats, weight, mining | Done |
| M2 Smelting, blacksmithing, tinkering, durability & repair, wanderers | Done |
| M3 Lumberjacking, fishing, farming, carpentry, bowcraft, cooking, workers + offline progress | Done |
| M4 Contracts, one-use plans, rare materials, runic crafting | Done |
| M5/M6 Warrior combat with stances, dungeons, scouting, sealed passages, death & corpse | Done |
| M7 Ranger taming, pets, loyalty, bonding, Call of the Wild | Done |
| M8 NPC trainers, phone layout | Partly: no achievements, sound or insurance yet; balance needs real play |

Differences from this plan, made while building:
- Farming is click-to-harvest like the other gathering skills (no real-time crop growth).
- Workers make one attempt per minute and wear tools slowly (15% per attempt); wages come from bank gold.
- Plans are used up only when the craft succeeds; a failure costs the materials but keeps the plan.
- Stances and their abilities are warrior-only; Call of the Wild is ranger-only.
- Mine level 4 (Gnarl Halls) opens when the Gnarl Warrens boss falls. Level 3 is open from Mining 55.
- Item insurance (6.4) and pet herding (7) are not built.

---

## 1. Hosting & tech

### GitHub Pages: can I have more than one?
Yes. GitHub Pages has two kinds of sites:

| Kind | Repo | URL |
|---|---|---|
| User site (one per account) | `lukasgreg/lukasgreg.github.io` | `https://lukasgreg.github.io/` |
| Project site (one per repo, **unlimited**) | `lukasgreg/<any-repo>` | `https://lukasgreg.github.io/<any-repo>/` |

`fpint/submission/` is almost certainly the `fpint` repo published as a project site.
**This repo doesn't need to move.** Turn on Pages for `lukasgreg/ZY_SkillGame` and the game will be at
`https://lukasgreg.github.io/ZY_SkillGame/`. If you want a nicer URL, rename the repo (for example `ember-and-ore`).
Note: on a free GitHub plan, Pages only works for **public** repos.

### Stack (recommended)
- **TypeScript + Vite**, a static build with no server.
- **Deployment:** a GitHub Actions workflow (`actions/deploy-pages`) builds and publishes on every push to `master`.
- **Rendering:** DOM/CSS for the UI (inventory, skills, shop), plus a small `<canvas>` or CSS sprites for the
  action scenes (pickaxe swing, combat). No game engine is needed at this scope. We can switch to PixiJS later if the scenes need it.
- **Save:** `localStorage` with autosave after every meaningful action, plus **Export/Import save** as a base64 string
  (the only backup, because there's no server).
- **Seeded RNG** (for example mulberry32). Each dungeon run has a seed, so the layout is fixed and you can't reload
  the page to get a better outcome. This also lets you go back to your corpse in the same dungeon.
- **Offline progress:** the save stores `lastSeen`. On load, the game simulates worker and pet production up to a cap (8 h at the start).
- **Art:** game-icons.net (CC BY 3.0) for item and skill icons, and Kenney.nl (CC0) for sprites. Add attribution in the credits.
- All balance numbers live in **data files** (`/src/data/*.ts`), so tuning doesn't touch the game logic.
- **Fonts (style C):** Cinzel for headings and EB Garamond for body text. Both cover Czech diacritics (ě š č ř ž ý á í é ů ú).
- **i18n:** no text is hard-coded in the UI. Every string has a key in `src/i18n/en.ts` and `src/i18n/cs.ts`, with a
  language toggle in the settings (default: the browser language). Messages use parameters and plural forms
  (Czech has 1 / 2–4 / 5+: *1 ruda, 3 rudy, 5 rud*) through `Intl.PluralRules`. Item and skill names are data keys too.
  Czech skill names follow the shard tradition: Hornictví, Kovářství, Tesařina, Dřevorubectví, Mechanika, Řezbářství,
  Krejčovství, Rybaření, Vaření, Sečné / Drtivé / Bodné zbraně, Taktika, Kryt štítem, Lukostřelba, Krocení, Léčení zvířat,
  Znalost zvěře, Stopování, Táboření, Pastevectví.

---

## 2. What we take from Ultima Online (research summary)

| UO mechanic | How UO does it | What we keep |
|---|---|---|
| **Skills** | ~58 skills, 0–100 (120 with power scrolls), 0.1 steps, total skill cap 700 | 0.0–100.0, 0.1 steps; total cap forces specialization |
| **Use-based growth** | You gain a skill only by using it. Gain chance is higher at low skill and when the task is *challenging* (success ~50%) | Same principle (section 4) |
| **Too easy / too hard** | A task has a min and max skill. Success chance scales linearly between them. Above the max you get no gain. Below the min you can't attempt it | Same; every action has `minSkill` and `maxSkill` |
| **Skill locks** | Up / down / locked arrows let you drop one skill to make room for another under the cap | Same (introduced once the cap matters) |
| **Stats** | STR, DEX, INT, cap 225 total, raised by using skills tied to them | STR / DEX / INT, cap 225, raised by skill use |
| **Weight** | Max weight ≈ 40 + 3.5 × STR; overweight = can't move | Same formula; overweight = can't gather or leave the mine |
| **Gathering** | Mining needs a pickaxe or shovel. Ore spots ("banks") run out and respawn. Higher skill unlocks colored ores (Iron → Dull Copper → Shadow Iron → Copper → Bronze → Gold → Agapite → Verite → Valorite) | Same tiers, spread over 0–100 so you feel progress sooner |
| **Crafting** | Exceptional quality chance, tools wear out, colored materials give bonuses | Same |
| **Bulk Order Deeds** | NPCs ask for a batch of items and reward rare things (runic hammers, which are tools with limited charges) | **Wanderer contracts** and **one-use plans** |
| **Combat** | Hit chance compares attacker and defender weapon skills. Tactics, Anatomy and STR add damage. Swing speed comes from the weapon and DEX. Parrying blocks with a shield | Simplified version of the same (section 6) |
| **Death** | You become a ghost and your corpse stays where you died with your items. The corpse decays after several minutes and anyone can loot it | 5-minute corpse recovery inside the dungeon |
| **Taming** | Animal Taming, Animal Lore, Veterinary; control slots (max 5); pets gain skills; bonding | Ranger path, simplified |

### What we take from Andaria (andaria.cz, wiki.andaria.cz)
| Andaria mechanic | What it does there | How we use it |
|---|---|---|
| **8 professions**, each with its **own maximum for every skill** (for example a Craftsman's Mining max is 100% but Archery only 40%) | Skills aren't class-locked, but each profession can only master its own field | Profession = a table of skill maximums (section 3.2). Off-profession skills are usable but capped |
| **Profession stat caps** (Warrior STR 100 / DEX 85 / INT 65, Craftsman 90/90/70, Ranger 85/85/80) | Strength and weakness by profession | Same numbers |
| **Random starting skills** in ranges (Craftsman: Smithing 20–30, Mining 15–25, Carpentry 15–25...) | Every character starts a little differently | Same. Rolled at creation |
| **Other skills start at 0** and must be **taught by an NPC or player** | A gold sink and a reason to visit town | NPC **trainers** sell the first points of a skill (up to 30) for gold |
| **3 races** (Human, Elf, Barbarian): small random stat changes (±1–5), +1.5–5 to one profession skill, different regeneration | Flavor without hard min-maxing | Same (section 3.1) |
| **Ores with two skill values**: a minimum to mine and the skill at which the yield is highest. Iron 1–30, Copper 30–60, Silver 45–75, Gold 60–90, Mithril 80–110 | Every tier stays useful for a long time | Our ore table follows this model (section 5.2) |
| **Building materials and specials** (clay, stone, sandstone, marble, coal, sulfur, obsidian, flint, gems that need 80 Mechanics) | Mining feeds more than one craft | Same: side resources feed other crafts |
| **Recipes need several skills** (Anvil: Blacksmithing 40 + Mechanics 46; Forge: Blacksmithing 20 + Mining 55) | Cross-skill progression | Workstations you build yourself: forge, anvil, loom, sawmill |
| **Smelting has its own skill range** per metal; **dark metal** has a small chance to come out of coal, master miners only | A second roll after mining | Smelting can fail. Rare bonus metals |
| **Warrior stances** (Normal / Combat / Defensive) with abilities: Second Wind, Crushing Blow (stun), Leap, Warrior's Cry (taunt). Switching costs all stamina | Tactical choices in a fight | Perfect fit for **turn-based** combat (section 6.2) |
| **Ranger**: Tracking, Camping (rest), Animal Healing, summoning animals and shapeshifting | Utility outside combat | Tracking scouts dungeons for free, Camping is a safe rest in one-way sections |
| **Shared abilities**: Rest, *Mark Home* + *Way Home* (teleport, mark once a month) | Escape and logistics | A rare **Way Home** charge is the only way out of a one-way dungeon section |
| **Dungeons rated in skulls (difficulty 1–5) and clocks (length 1–5)**, split into "with treasure" and "little treasure" | Players see what they're getting into | Dungeon Board shows skulls and clocks. Investigation reveals the rest |
| **Lore: goblins (skřeti) hold many mines**, and cities have fallen | The world is under pressure | The deepest mine levels are **goblin-held**. Warriors (yours or hired NPCs) clear them so the craftsman can mine there. This is the main link between professions |
| **Iron trader with prices that move with supply and demand** | A living market | Dynamic prices in the shop and market |
| **Powerhour** (Fri–Sun, 18:00–22:00): faster skill training | A reason to come back | Weekend-evening powerhour (local time) with ×1.5 gain chance, plus one free daily powerhour you start yourself |

---

## 3. Character, stats, weight

### 3.1 Creation
1. **Race:** Human (DEX +1–5; STR *or* INT −1–5), Elf (INT +1–5, STR −1–5), Barbarian (STR +1–5, INT −1–5).
   Each race also gets +1.5–5 to one profession skill (Human: Carpentry / Edged Weapons, Elf: Archery / Woodcarving, Barbarian: Blacksmithing / Blunt Weapons / Herding).
   Regeneration in seconds per point (HP / Stamina / Mana): Human 3/5/5, Elf 4/5/3, Barbarian 2/6/5.
2. **Profession:** Craftsman, Warrior or Ranger (more later: Thief, Bard, Priest...).
3. Starting skills are **rolled within the profession's ranges**. Everything else is 0.

### 3.2 Profession skill maximums (from Andaria, trimmed to our skill list)
| Skill | Craftsman | Warrior | Ranger |
|---|---|---|---|
| Mining, Lumberjacking, Blacksmithing, Carpentry, Tinkering (Mechanics), Woodcarving/Bowcraft, Tailoring | **100** | Blacksmithing 50, others 30 | Woodcarving 90, others 30 |
| Edged / Blunt Weapons, Tactics, Shield Block (Parrying), Weapon Lore | 20–50 | **100** | Edged 80, others 40 |
| Archery | 40 | 80 | **100** |
| Taming, Animal Healing, Animal Lore, Tracking, Herding | 30 (Herding 70) | 30 | **100** |
| Fishing / Cooking / Camping | 60 / 100 / 50 | 50 / 100 / 50 | **100** / 100 / 100 |
| Healing / Anatomy | 30 / 20 | 40 / 80 | 70 / 50 |
| **Stat caps STR / DEX / INT** | 90 / 90 / 70 | 100 / 85 / 65 | 85 / 85 / 80 |

The 700 total cap still applies on top of these. A character can't max everything their profession allows, so skill locks (▲ ▼ 🔒) matter.

### 3.3 Stats and weight
- **Stats:** STR, DEX and INT. Each profession has its own caps (table above).
  - STR adds max weight, HP and melee damage.
  - DEX adds swing speed, flee chance and archery accuracy.
  - INT adds crafting exceptional chance and success with plans and alchemy.
- **Stat gain:** each skill has stat weights (Mining: STR 0.8 / DEX 0.2). Using a skill has a small chance
  (~2–5%) of +1 to a weighted stat. The chance drops as you approach the cap.
- **HP** = 50 + STR. **Stamina** = DEX, used for fleeing and gathering streaks.
- **Max weight** = `40 + 3.5 × STR` stones. Each resource has a weight (ore 1 stone each, logs 1, ingots 0.1, fish 0.5).
  When you're overweight you can't gather. You have to walk to the bank or smelt the ore first, which is a deliberate loop.
- **Total skill cap:** 700. A profession isn't a class lock. A Craftsman *can* raise Edged Weapons, but only to that profession's maximum.

---

## 4. Skill system (the core)

Every action (mine, chop, craft longsword, hit with sword) has:
`skill`, `minSkill`, `maxSkill`, `difficulty`, `rarity`.

### Success chance
```
p = clamp((skill - minSkill) / (maxSkill - minSkill), 0, 1)
```
Below `minSkill` you can't attempt the action. Gathering below the minimum always fails ("you find nothing").

### Gain chance (checked on every attempt, success or fail)
```
headroom   = (100 - skill) / 100                     // 1.0 at 0, 0.0 at 100
challenge  = 1 - |p - 0.5| * 1.2                      // peaks when p ≈ 50%
rareBonus  = 1 + rarity * 0.5                          // common 0, rare 1, epic 2, plan 3
baseGain   = 0.6
gainChance = baseGain * headroom^1.6 * challenge * rareBonus * (success ? 1.0 : 0.5)
if skill >= maxSkill:  gainChance = 0                  // "too easy"
```
- At low skill gains come constantly. Past 90 they're rare. This is the curve you asked for.
- **Rare or complex items** multiply the gain chance, so crafting from a plan near your skill limit is the
  fastest way to grow at high levels.

### Gain amount
| Skill | Gain per success | Risk |
|---|---|---|
| 0–10 | 0.1 / 0.2 / **0.3** (weights 50/35/15) | high fizzle and fail rates |
| 10–50 | 0.1 (10% chance of 0.2) | |
| 50–100 | 0.1 | |

### Target pacing (to be tuned in a balance spreadsheet)
| Range | Active play time |
|---|---|
| 0 → 30 | ~20–30 min |
| 30 → 60 | ~2–3 h |
| 60 → 90 | ~8–12 h |
| 90 → 100 | ~15–20 h (plans and rare materials help a lot) |

### Fizzle vs fail
- **Fizzle**: the action produced nothing and cost only time, and sometimes tool durability.
- **Fail (crafting)**: some of the materials are lost.
- Both are more likely at low skill, and both still roll for a skill gain at half the normal chance.

---

## 4b. Item durability & repair
Every **tool, weapon, armor piece, shield and bag** has durability `current / max`, shown as a bar and a word:
*Pristine · Worn · Damaged · Failing*.

| | Rule |
|---|---|
| **Max durability** | Set by the item type × material × quality. Example: iron pickaxe 50, mithril pickaxe 120, exceptional +25%, runic-crafted +50% |
| **Wear: tools** | −1 per use (gather or craft attempt). A fizzle wears the tool too |
| **Wear: weapons** | −1 on ~30% of hits. Blocked hits and hits against armored monsters wear it more |
| **Wear: armor / shields** | −1 on ~25% of hits taken, applied to a random worn piece. Each successful shield block wears the shield |
| **Low durability** | At *Failing* (below 15%) the item works worse: tools are 25% slower, weapons do −15% damage, armor −20% defense. The UI warns you |
| **Break** | At 0 the item **breaks and is destroyed**, along with any runes or bonuses on it. No undo. A warning shows at 10% |

**Repair**
- Uses the skill that made the item: **Blacksmithing** for metal, **Carpentry / Bowcraft** for wood, **Tailoring** for leather and cloth, **Tinkering** for tools.
- Repair restores durability to max, but **each repair lowers max by 1–5** (less with higher skill), as in UO.
  An item can't be repaired forever and will eventually need to be replaced, which keeps demand for new crafts.
- **Repair success** = the usual success curve (section 4) using the item's craft difficulty. A failed repair costs extra max durability.
- Repairs **can give skill gains** at a reduced rate (×0.3), so they're useful but not a way to grind to 100.
- **NPC smith repair** in town costs gold, lowers max more, and isn't available inside a dungeon.
- **Repair kits** (made by craftsmen, consumed on use) let warriors and rangers repair in the field, including in one-way sections.
- **Rare upgrades:** *Fortifying Powder* (from plans or dungeon loot) adds +10 max durability.

**Effect on the economy:** wanderers bring broken-down gear for repair contracts. Your workers wear out their tools, so they
need new ones from Tinkering. Warriors either budget for repairs or risk their gear breaking in the middle of a dungeon.

---

## 5. Craftsman path

### 5.1 Gathering loop (click → wait → result)
1. Click the **ore vein**. The character swings the pickaxe for a **random 2–5 s** (CSS sprite animation, sparks, sound).
   DEX and tool quality shorten the time.
2. The result is a roll:
   - **Fizzle**: "You loosen some rocks but fail to find any useable ore."
   - **Success**: 1–3 ore, with the tier rolled from the ones you can mine (higher tiers get more weight as skill rises).
   - **Rare find** (~0.5–2%): a gem, a fossil, or *rarely* a plan fragment.
3. Each vein has a hidden amount of ore (for example 10–20 pulls). When it's empty, you move to the next spot or a deeper level.
4. Tools have durability (a pickaxe lasts ~50 uses). Tools come from **Tinkering**.

### 5.2 Gathering skills & resource tiers
| Skill | Tool | Tiers (min skill to harvest) |
|---|---|---|
| **Mining** | pickaxe / shovel | Andaria model, *min skill – skill for best yield*: Iron 0–30, Copper 30–60, Silver 45–75, Gold 60–90, Mithril 80–100 (very rare even at 100). Side finds: Clay 0–50, Stone 2–60, Coal 10–70, Sandstone 25–75, Marble 30–90, Obsidian 30–100, Sulfur 40–100, Gems 75–100 (need Tinkering 80 to cut) |
| **Smelting** (part of Mining) | forge | Separate success roll per metal (Iron 10–40 ... Mithril 95–100). **Steel** = iron + coal (special recipe). **Dark metal**: rare drop when coal goes into the forge, master miners only |
| **Lumberjacking** | hatchet / axe | Log 0, Oak 25, Ash 45, Yew 65, Heartwood 85, Bloodwood 95, Frostwood 99 |
| **Fishing** | rod | Fish 0, Big Fish 40, Deep-sea 70, sunken chests and SOS bottles 85+ |
| **Farming** (not in UO) | hoe / seeds | Wheat 0, Flax/Cotton 20, Reagents 40, Rare herbs 70. Crops grow in real time while you're away |
| **Skinning / Herding** (later) | knife | hides, wool, used by Tailoring |

### 5.3 Crafting skills
| Skill | Input | Output | Who buys it |
|---|---|---|---|
| **Blacksmithing** | ingots (needs smelting) | swords, maces, armor, shields | warriors |
| **Carpentry** | boards | staves, shields, furniture, worker housing upgrades | warriors, town |
| **Bowcraft & Fletching** | boards + feathers | bows, crossbows, **arrows (consumable)** | rangers |
| **Tailoring** | cloth, leather | leather armor, bags (+ carry capacity) | everyone |
| **Tinkering** | ingots, boards | **tools** (pickaxes, hatchets, rods) | you, your workers |
| **Cooking** | fish, wheat | food (buffs, healing) | dungeon runners |
| **Alchemy** | herbs | potions (heal, cure, strength) | dungeon runners |

- **Workstations you build yourself** (Andaria-style recipes that need several skills): Forge (Blacksmithing 20 + Mining 55:
  20 stone, 10 coal, 1 iron bar), Anvil (Blacksmithing 40 + Tinkering 46), Loom, Sawmill. Until you have them, you pay rent to use the town ones.
- **NPC trainers** in town sell skill points from 0 up to 30 for gold. Above 30 you train by doing.
- **Quality:** normal or **exceptional** (+20% stats, sells for 2–3×). The exceptional chance grows with skill, INT and how far above `minSkill` you are.
- **Material bonus:** a Valorite longsword is better than an Iron one, and the value grows with the tier.

### 5.4 Wanderers (the NPC economy)
Warriors and rangers (NPCs) visit your **shop** on a timer. Each one has a level, a budget and a need.
- **Direct sale:** they buy what you have on display at a price based on quality, material and demand.
- **Contracts (like UO Bulk Order Deeds):** "Bring me 10 exceptional Bronze maces within 2 days."
  Rewards are gold plus one of the following:
  - **Rare resources** brought back from dungeons (dragon scale, ethereal ore, ancient wood).
  - **One-use plans**: the recipe disappears after one craft. Examples: *Runic Hammer (5 charges)*, *Blade of the Deep*,
    *Reinforced Pack (+50 stones)*. Plans give a big skill-gain bonus (rarity 3) and make very valuable items.
  - **Trade goods** you can't gather yourself.
- A wanderer's level follows *your* reputation, so better customers bring better rewards over time.

### 5.5 Workers (idle layer)
- Hire a **Miner, Lumberjack, Fisher or Farmer**. Each one produces resources per hour, online and offline.
- Each worker has their own skill level, which decides which tiers they can harvest.
  **A worker's skill is capped at your own skill minus 10**, so active play stays the main way to progress.
- **Costs grow exponentially:** worker *n* costs `hire = 100 × 1.6^n` gold plus a wage per hour.
  Training a worker (raising their skill) costs `50 × 1.12^level`.
- Workers wear out tools, so Tinkering stays useful.
- Upgrades: mine levels (deeper = better ore), better housing (more workers), a foreman (auto-sells surplus).
- **Goblin-held levels** (Andaria lore): from Silver depth down, mine levels are occupied by goblins. You unlock a level when
  it's **cleared**: by your own Warrior character (it's a short dungeon), or by paying NPC wanderers to do it.
  Goblins come back from time to time and raid a level, which stops workers there until it's cleared again.

---

## 6. Warrior path

### 6.1 Combat skills
| Skill | Effect |
|---|---|
| **Edged / Blunt / Piercing Weapons, Archery** (Andaria naming) | hit chance with that weapon type; unlocks better weapons |
| **Tactics** | +damage % (UO: up to +~50% at 100) |
| **Anatomy** | +damage %, crit chance |
| **Shield Block** (Parrying) | block chance with a shield (~33 % at 100); unlocks the Defensive stance |
| **Healing** | bandage heal amount and speed, needed between fights |
| **Resisting Spells** (later) | defense against magic monsters |

### 6.2 Combat model (turn-based)
**Turn order:** initiative = DEX + weapon speed bonus + d10, re-rolled every round. Fast weapons (daggers) can act twice in
some rounds, and heavy ones (two-handed maces) sometimes skip one. Pets and summons take their own turns.

**On your turn, choose one action:**
| Action | Effect |
|---|---|
| **Attack** | One swing or shot (formulas below) |
| **Stance ability** | Depends on your current stance (table below) and costs stamina |
| **Change stance** | Costs **all your current stamina** (Andaria rule), so you choose it carefully |
| **Bandage** | Heals by Healing skill. Takes 2 turns and is interrupted if you're hit |
| **Potion / food** | Instant, one per turn |
| **Command pet** (Ranger) | Attack / guard / heal target |
| **Flee** | DEX vs fastest enemy. Results follow the rules in section 6.3 |

**Warrior stances (from Andaria):**
| Stance | Unlock | Damage dealt / taken | Abilities |
|---|---|---|---|
| **Normal** | start | 100% / 100% | **Second Wind** (restore HP + stamina, once per fight), **Crushing Blow** (blunt weapon or fists: chance to stun for 1 turn) |
| **Combat** | Tactics 50 | 125% / 125% | **Leap** (act first next round + bonus hit), weaker Crushing Blow |
| **Defensive** | Shield Block 50 | 70% / 70%, *with less random damage* | **Warrior's Cry** (all enemies target you; protects pets/allies), Crushing Blow |

**Formulas**
```
hitChance  = clamp( (atkSkill + 20) / ((defSkill + 20) * 2) * (1 + tactics/400), 0.05, 0.95 )   // UO-style
damage     = weaponBase(min..max) * materialMult * qualityMult
           * (1 + tactics/200 + anatomy/200 + str/300) * stanceMult - armor
blocked    = shield && rand < shieldBlock/300 + shieldBonus
```
- Each attack that hits *or misses* rolls for a skill gain using the section 4 formula.
  `minSkill`/`maxSkill` come from the monster's level. Fighting monsters that are too weak gives no gain, which is UO's "too easy" rule.
- **Archery** uses up arrows, which you have to buy. That ties the warrior's spending to the craftsman's shop.

### 6.3 Dungeons (roguelike runs)
- The town **Dungeon Board** lists dungeons, each with a seed and a theme, rated Andaria-style in
  **skulls (difficulty 1–5)** and **clocks (length 1–5)**, and marked as *with treasure* or *little treasure*.
  Example themes: Bandit Ruins (1 skull), Ice Cave (2), Haunted House (3), Necromancer's Lair (4), Old Shaft (5).
- **Investigation (optional, costs gold):** pay a scout to reveal the boss type, room types and whether there are one-way sections.
  More gold reveals more. A Ranger can use **Tracking** to reveal some of this for free.
- **Map:** a node graph of rooms, branching like Slay the Spire's map.
  Room types: monster, elite, treasure, shrine (heal), trap, event, boss.
- **One-way events:** *you fall through a pit*, *the corridor collapses behind you*, *a portal closes*.
  After one of these the path back is cut, and the only way out is forward or a rare exit scroll.
- **Flee:**
  - If there's a path back, a successful flee (DEX vs monster) takes you to the previous room. From there you can leave the dungeon.
  - If there's no path back, a successful flee takes you to the previous room, but you can't leave.
    You can bandage, eat, drink potions or **Camp** (Camping skill: a safe rest, but wandering monsters may find you), then go back in.
  - The only escape from a one-way section is a rare **Way Home** charge (Andaria's *Cesta domů*).
  - A failed flee means the monster gets a free hit.
- **Loot:** gold, rare resources (sold to craftsman NPCs or kept for your own craftsman), plans, and equipment.

### 6.4 Death & corpse recovery
- When you die, your **corpse stays in that room** with **all your carried items and gold**. You respawn in town as a ghost
  with no items (resurrection is free in town).
- A **5:00 real-time timer** starts. If you re-enter the *same dungeon seed* before it runs out, the path to your corpse
  is marked on the map. The rooms you cleared stay cleared, but some monsters respawn as wanderers.
- When the timer runs out, the corpse **decays** and everything on it is lost.
- An **insurance** gold sink (also from UO, later): pay per item to keep it when you die.
- **Bank** (in town) holds items you didn't carry into the dungeon, so you choose how much to risk.

---

## 7. Ranger (tamer) path
- Skills: **Animal Taming, Animal Lore, Veterinary (Animal Healing), Archery, Tracking, Camping, Herding**.
- **Call of the Wild** (Andaria ability): summon a temporary forest animal that fights to the death. It costs a lot of stamina and mana,
  so it's an emergency move. Later you can shapeshift into an animal to sneak past rooms.
- **Taming:** in the wilderness or in dungeon rooms you can try to tame a creature instead of killing it.
  The attempt takes several seconds and can be interrupted by an attack. Success is based on `minSkill`/`maxSkill` per creature
  (wolf 30, bear 50, drake 85, dragon 98).
- **Control slots:** max 5 (UO value). Stronger pets use more slots (wolf 1, bear 2, drake 3, dragon 4).
- **Pets fight next to you** and gain their own skills. **Loyalty** drops if you don't feed them (food comes from Cooking or Farming).
  At low loyalty the pet may run off.
- **Veterinary:** heal pets in or between fights, or resurrect a **bonded** pet. Pets bond after a few days of ownership.
  An unbonded pet that dies is gone for good.
- **Animal Lore:** shows pet stats and raises the control chance for difficult pets.
- Pets left at home can **herd and produce** (wool, milk, eggs), which overlaps with the Craftsman's economy.

---

## 8. How the paths connect
```
Craftsman ──weapons, armor, arrows, potions, tools──▶ Wanderers (NPC warriors/rangers)
     ▲                                                       │
     └──── gold, rare resources, one-use plans ◀─────────────┘
Warrior/Ranger ──dungeon loot──▶ town market ──▶ Craftsman shop
```
**Character slots with a shared bank:** your own Warrior wears gear your own Craftsman made, clears goblin-held mine
levels, and brings back rare resources. It's like having several characters on one UO account. NPC wanderers fill the same
roles for players who stay with one character.

---

## 9. Screens (MVP UI)
1. **Character creation:** name, path, starting stat spread.
2. **Town hub:** Bank · Shop · Dungeon Board · Workers · Smelter/Forge · Skills.
3. **Gathering scene:** the resource node, a big click target, the swing animation, a log ("You put 2 Bronze Ore in your backpack"), and a weight bar.
4. **Crafting window:** UO-style category list → item → materials and success chance shown → craft ×1 / ×10.
5. **Skills panel:** 0.0–100.0 values, lock arrows (↑ ↓ 🔒), total cap. A floating "+0.1 Mining" appears on gain (UO-style "Your skill in Mining has increased by 0.1").
6. **Dungeon map + combat view:** room graph, HP and stamina bars, action buttons, combat log.

---

## 10. Milestones
| # | Milestone | Done when |
|---|---|---|
| **M0** | Vite + TS project, GitHub Actions deploy to Pages, save/load/export, **i18n EN/CZ**, style C shell | Empty page live at `lukasgreg.github.io/ZY_SkillGame/` |
| **M1** | Skill engine + stats + weight + **Mining** loop with animation, veins, ore tiers | Mining 0→30 is fun for 20 minutes |
| **M2** | Smelting, **Blacksmithing**, **Tinkering**, **durability + repair** (tools), bank, shop with simple NPC buyers | A full gather → craft → sell loop |
| **M3** | Lumberjacking, Fishing, Farming, Carpentry, Bowcraft, Cooking; **Workers** + offline progress | The idle layer works |
| **M4** | Wanderer **contracts** + **one-use plans** + rare resources | The long-term craftsman goal is clear |
| **M5** | **Warrior**: turn-based combat, stances, weapon/armor wear, repair kits, dungeon node map, investigation, flee rules | First dungeon run playable |
| **M6** | Death, corpse timer, recovery, insurance, one-way events | The roguelike tension is in place |
| **M7** | **Ranger**: taming, pets, loyalty, veterinary | Third path playable |
| **M8** | Balance pass, skill cap 700 and locks, achievements, sound, polish | v1.0 |

Each milestone is playable and deployed on its own, so you can test on github.io after every step.

---

## 11. Open questions
- None blocking. Balance numbers will be tuned while playing M1.

---

## 12. Setting: the Kingdom of Ardenhal
Our own world. It takes the mood of Andaria (a besieged human realm and lost mines) but none of its names or lore.

- **Ardenhal** is the last free kingdom on the coast. Its wealth came from the deep mines of the **Greyspine** mountains.
- A generation ago the **Gnarl** (Czech: *gnarlové*), a horde of underground goblin-kin, broke out of the old tunnels
  and took the deep mine levels and the outer towns. They still raid from below.
- **Kamenbrod** (Stonebridge) is the market town where you live. It has a bank, a forge, trainers, the Dungeon Board and a shop.
- The **Old Empire** left ruins full of plans, runes and odd metals, and most dungeons are built in them. One-use plans
  come from there, and so does the rare metal **Mithril** (Czech *mithril*).
- Races: **Humans** (the realm's people), **Elves** (forest folk from the west), **Barbarians** (northern clans, the best smiths).
- **Story hook:** each mine level you take back from the Gnarl, and each dungeon boss you kill, pushes the **front line** on a
  world map. It's a light progression meter that unlocks new towns, traders and dungeon tiers.
