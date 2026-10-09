# Ardenhal v2 plan

This is the next round of work, based on feedback after the first playable version.
Each phase is playable and deployed on its own. **Status** shows where to pick up if a session ends.
Every phase bumps `SAVE_VERSION` with a migration in `src/engine/save.ts`, adds tests to `src/engine/engine.test.ts`,
and puts every new string in both `src/i18n/en.ts` and `src/i18n/cs.ts`.

| Phase | Topic | Status |
|---|---|---|
| A | Levels and experience (Endor-style) | done |
| B | Metals with special effects, monster families | done |
| C | UO armour pieces, paperdoll, weight drains stamina | done |
| D | Random dungeons: visible rooms, events, omens, affixes, final chest, loot items | not started |
| E | Patterns for rare metals, hiring a master craftsman | not started |
| F | Taming in the wild, INT-based control slots, better animal healing | not started |
| G | Pet experience and levels | not started |

---

## Sources
- **Endor Revived** (https://wiki.endor-revived.com, page *Attr:Experience* and the class pages):
  - Levels run 1–50, and each level needs much more experience than the last (11k → 10M).
  - Base stats and **skill caps rise with level up to level 30**; after that, levels only raise stats.
  - Craftsmen **don't get experience from kills**. They level from bulk orders (our contracts), quests and experience stones.
  - At level 30 a human craftsman has about 100 STR / 79 DEX / 77 INT, and a human ranger 102 / 98 / 69.
- **Andaria** (wiki.andaria.cz, *sys:zbroje*): armour sets made of pieces, with set totals for defence and weight:
  - leather 9 / 9.2
  - ring mail 26 / 76
  - plate 40 / 107
  - Each set has a minimum STR to wear.

  Its metals are iron, copper, silver, gold, mithril, steel, dark metal (from coal, master miners only) and blackrock.

---

## A. Levels and experience
**Rules**
- Level 1–50, stored as `xp` on the character. XP to go from L to L+1 is `round(300 × 1.15^(L-1))`:
  - L1→2: 300
  - L10: about 1,050
  - L20: about 4,300
  - L30: about 17,300
  - L49: about 245,000
  - Total to 50: about 1.9M
- **Experience sources** (deliberately uneven):
  - Kills: `hp × (skill + 10) / 40` per monster. That's about 8 for a rat and about 1,000 for the Gnarl Warlord.
  - Contracts: `1.5 × gold reward`. This is the craftsman's main source, as with Endor's bulks.
  - Gathering: 0.5 per successful pull (tiny).
  - Crafting: `recipe.min / 20` per success (small).
  - Dungeon boss chest: 5% of the next level's XP.
- **Stats come from levels**: no more random stat gains from skill use.
  - `stat(L) = start + (cap − start) × (L − 1) / 49`, with race modifiers kept.
  - Every level raises STR, DEX and INT toward the profession caps.
- **Skill caps scale with level up to level 30**: `effective cap = profession cap × min(1, 0.3 + 0.7 × (L − 1) / 29)`.
  - At level 1 a 100-cap skill is limited to 30. It reaches 100 at level 30.
  - NPC trainers and the 700 total cap still apply.
- Level-up: journal line plus a banner, and full hits and stamina.
- **Migration:** existing characters start at level 1 with 0 XP. Their stats become max(current, level stats), so no one loses anything. Skills already above the new cap are kept, but don't grow until the cap catches up.

**UI**
- The header shows `Level N` and an XP bar.
- The character tab shows next-level stats and the skill caps at the next level.

## B. Metals and monster families
- **Monster families**: beast, humanoid, undead, gnarl, dragon. Every monster gets one.
- **Metals and their weapon/armour effects** (on top of the current damage, armour, durability and value multipliers):

| Metal | Source | Effect |
|---|---|---|
| Iron | Mining 0+ | — |
| Copper | Mining 30+ | Durability +10% |
| Steel | Iron + coal (Blacksmithing) | Durability +30% |
| Silver | Mining 45+ | **×1.5 damage vs undead**; armour takes 25% less from undead |
| Gold | Mining 60+ | Weapon: +25% gold from kills; armour: soft (durability ×0.9) |
| Dark iron | Small chance when smelting coal at Mining 90+ (Andaria's dark metal) | Weapon drains life: heals 15% of the damage dealt |
| Mithril | Mining 80+ | Half weight; damage ×1.3, armour ×1.35 |
| Blackrock | Gnarl Halls ore (mine level 4) and Gnarl drops | **×1.5 damage vs gnarl and dragons**; armour takes 20% less from them |

- Rare metals are silver, gold, dark iron, mithril and blackrock. They need a **pattern** to craft (phase E).
  Common metals (iron, copper, steel) can be crafted freely.

## C. Armour pieces, paperdoll, weight
- **Slots:** weapon, shield, head, neck, chest, arms, hands, legs.
- **Armour families** (all 6 pieces each):

| Family | Skill | Material | Defence (set total) | Weight (set) | Min STR |
|---|---|---|---|---|---|
| Leather | Tailoring | hides | 12 | 9 | 15 |
| Studded | Tailoring | hides + iron bars | 16 | 18 | 25 |
| Ring mail | Blacksmithing | bars | 22 | 38 | 28 |
| Chain mail | Blacksmithing | bars | 28 | 45 | 35 |
| Plate | Blacksmithing | bars | 40 | 70 | 50 |

  - Each piece's share of the set: chest 35%, legs 22%, arms 14%, head 14%, neck 8%, hands 7%.
  - Metal multipliers apply to ring, chain and plate.
  - Old items migrate: chain coif → chain head, ringmail tunic → ring chest, plate helm → plate head, platemail → plate chest.
- **Weight and stamina:**
  - Gathering costs more stamina when the pack is over half full: `×(1 + 2 × max(0, load − 0.5))`.
  - In combat each round costs `round(worn armour weight / 25)` stamina.
  - At 0 stamina you are **exhausted**: −15% hit chance, ×0.75 damage.
- **Paperdoll:** an SVG figure in the Character tab with slots around it. Worn pieces are drawn on the body in the metal's colour. Clicking a slot lists the items in your pack that fit it.

## D. Random dungeons
- **Every expedition is new and much bigger** (feedback: "much more nodes where to go, I don't want to be going again and again"):
  - A new seed each time and **12–30 layers** depending on length.
  - **2–5 rooms per layer** with cross-links, so there are many routes.
  - **Side branches** that rejoin later, and dead ends that hold caches or a lair.
  - **Two or three wings** that split near the start and meet again before the boss.
  - The map scrolls horizontally, and the current room stays centred.
  - Room-type weights change with depth and with the dungeon's theme, so no two runs feel alike.
- **You can see what's next:** the types of rooms one step ahead are always shown on the map. Scouting reveals the whole map and the sealed passages.
- **Room types:**
  - monster
  - elite
  - treasure
  - shrine
  - trap
  - **event**
  - **campfire** (safe rest)
  - **cache** (random loot items)
  - boss
- **Events** (picked by seed; each has two choices and seeded outcomes):
  - Wounded adventurer: help with 2 bandages (reward: gold or a pattern) or rob them (gold; reputation −3).
  - Old fountain: drink (heal fully, or 20% poison damage) or fill a flask (food).
  - Cursed altar: offer gold (a buff for the rest of the run: +15% damage) or smash it (fight an elite).
  - Gnarl merchant: buy a Way Home scroll or a repair kit at double price, or leave.
  - Collapsed tunnel: dig through (stamina; Mining helps) to an extra cache, or go around.
  - Sleeping beast: only in hard dungeons. A unique tameable animal (drake, dire wolf) for phase F; otherwise sneak past or fight.
- **Omens:** each expedition gets 1 random omen, shown on the board before entering. It changes every time.
  - Infested: +1 monster per room, more XP.
  - Rich veins: more caches and chests.
  - Darkness: more traps; scouting costs half.
  - Restless dead: undead appear in any dungeon.
  - Calm: fewer fights, more events.
- **Monster affixes** from layer 3 down, with a chance growing with skulls: enraged (+30% damage), armoured (+4 armour), swift (+8 speed), giant (+50% hits, +40% XP).
- **Bigger pools:** 3–4 monster kinds per dungeon, plus occasional wanderers from a neighbouring dungeon.
- **Final chest** after the boss, always:
  - gold
  - 1–2 random pieces of gear (iron, copper or steel weapons and armour, sometimes exceptional; never rare metals)
  - a **pattern** with a chance that grows with skulls
  - rare materials
  - sometimes a plan
- **Loot items** from monsters, to sell or craft with:
  - hide (beasts) → leather armour
  - bone (undead)
  - gnarl tusk
  - ectoplasm (undead)
  - drake scale

## E. Patterns and the master craftsman
- **Pattern** = permission to craft one specific item in one rare metal, used up on success.
  Example: *Pattern: Silver Longsword*.
- Patterns live in the **shared bank**, so a warrior's finds reach the craftsman character.
- Sources: final chests, bosses, and contracts (rarely).
- **Hire a master craftsman** (town): a fighter hands over a pattern plus gold and gets the item without having the skill.
  - The NPC also needs the bars, or charges for them at triple their price.
  - Total cost is about 3× the item's value. It's expensive on purpose.

## F. Taming rework
- **Remove taming from dungeon fights.** Taming happens at a new gathering location, the **Wilds**, with 4 areas: Meadow, Old Forest, Highlands, Marsh.
  - **Track** (Tracking skill, 2–4 s) finds an animal in the area. Better tracking finds rarer animals.
  - **Tame** is a **10-second** action. Every 2 seconds a calming phrase appears ("Easy now…", "Good boy…", "I will take good care of you…").
    - Success uses the usual curve, Taming against the animal's minimum.
    - **On a failure the animal may attack** (30%, more for predators): you take a few hits and it runs off.
  - After taming you can keep the animal or release it.
- **Control slots from INT:** `slots = clamp(floor(INT / 10), 1, 10)`.
  - Animals and their slots:
    - chicken 1
    - cat 1
    - goat 1
    - dog 2
    - boar 2
    - wolf 3
    - frost wolf 4
    - bear 5
    - dire wolf 6
    - grizzly 8
    - drake 10
  - The skill needed rises with the animal's power.
  - Some unique animals (drake, dire wolf) appear only as sleeping-beast events in hard dungeons.
- **Animal Healing:**
  - A bandage heals `10 + skill / 5`.
  - Out of combat it takes `4 s − skill / 40`.
  - **Bringing a pet back needs Animal Healing 80 and 10 bandages.**
- Bonded pets lose loyalty half as fast.

## Order of work
A → B → C → D → E → F. Each phase is committed and deployed when its tests pass.

## G. Pet experience and levels
- Pets gain experience from every monster killed while they fight beside you: an equal share of the kill XP, about 70% of what you get.
- Pet levels run 1–30 and use the same XP curve as characters.
- Each level gives a pet +4% hits, +3% damage and +1.0 fighting skill on top of the animal's base. Its health bar and the Stable show its level.
- Bonded pets keep their level when brought back to life. Released pets lose it.
