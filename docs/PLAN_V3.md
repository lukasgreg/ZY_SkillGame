# Ardenhal v3 plan

The third round of work. It follows simulated play-testing and more research on Andaria and Endor.
Each phase is playable and deployed on its own. **Status** shows where to pick up.

| Phase | Topic | Status |
|---|---|---|
| 0 | Balance pass from simulations | done |
| H | Alchemy and potions, poison | done |
| I | Paragon enemies | done |
| K | Housing with rent (cottage → keep) | not started |
| L | More achievements | not started |
| M | Quality of life: auto-repeat, beginner's guide, keyboard shortcuts | not started |

---

## 0. Balance pass
**How the simulations work.** `SIM=1 npx vitest run src/engine/sim.test.ts` plays the game with simple policies and prints how fast things go:
- mining from skill 0, including waits for stamina
- 120 dungeon runs for a new warrior and a new ranger: bandage below 40% hits, flee below 15%, camp below 60%

**Before the fixes**
- Mining 30→40 took about 7 hours, because the level-1 skill limit was 35 and gathering XP was tiny.
- A new warrior died in half of all Cellar runs and beat no boss in 120 runs.
- A new ranger died in nearly every run.

**Fixes**
- Hit chance softened: `(a+40)/((d+40)×2)×1.2`.
- Dungeons scale with length: 8–12 layers at one hourglass, up to 28 at five.
- After every won fight you catch your breath: +15% hits, +30% stamina.
- Skill limit at level 1 is 50% of the profession cap.
- Gathering gives 1 XP per success.
- Archers get a free opening volley.
- Rangers get +15% bow damage and dodge 10% + DEX/500. They start with a hound and four leather pieces.

**After the fixes**
- Mining 40 in about 1 h, 50 in about 3 h, 60 in about 9 h. Gathering alone gets there; contracts are much faster.
- Warrior: level 4 after 10 runs, level 13 after 60. Deaths fall to about 1 in 5 runs once levelled.
- Ranger: level 4 after 10 runs, with 4 deaths.

## H. Alchemy and potions (Andaria), with poison
Andaria's alchemy uses one reagent per basic potion. Healing needs only 4% Alchemy; ink needs 50%.
Two simple potions can be mixed into a stronger one.

**The skill**
- New skill **Alchemy** (crafting, INT). Tool: **mortar and pestle** (Tinkering).
- Profession caps: craftsman 100, ranger 70, warrior 40.

**Reagents**
- Already in the game: ginseng (new, farming), garlic (new, farming), mandrake root (new, farming area 3), nightshade (new, farming area 4), healing herb, bloodmoss, spider silk (cobweb), pearl (black pearl), sulfur.
- New: bat wing, dropped by ice bats and banshees.

**Potions** (each potion gives 2; greater versions at high skill)

| Potion | Reagents | Alchemy | Effect |
|---|---|---|---|
| Lesser Heal | 2 ginseng | 4 | +25 hits |
| Heal | 3 ginseng, 1 herb | 35 | +50 hits |
| Greater Heal | 3 ginseng, 2 herb, 1 bloodmoss | 65 | +100 hits |
| Refresh | 1 pearl | 24 | Full stamina |
| Cure | 2 garlic | 12 | Removes poison |
| Agility | 2 bloodmoss | 12 | +10 DEX for 10 minutes |
| Strength | 2 mandrake | 13 | +10 STR for 10 minutes |
| Wisdom | 2 bat wing | 19 | +10 INT for 10 minutes |
| Stoneskin (Andaria's "magic armor") | 1 obsidian, 1 mandrake | 24 | +6 armour for 10 minutes |
| Explosion | 2 sulfur | 15 | Thrown: 15–30 damage to every enemy |
| Poison | 2 nightshade | 16 | Coats your weapon: 10 hits poison their target |

**Using potions**
- In a fight, drinking or throwing a potion takes your turn.
- Out of a fight, potions work at once.
- Buffs last in real time and are shown in the header.

**Poison**
- Spiders, banshees, mummies, gnarl shamans and lich acolytes can poison on hit (30%).
- Poison deals 2–6 a round for 4 rounds.
- Cure potions and bandaging at Healing 60+ remove it. Monsters can be poisoned too, by a coated weapon.

## I. Paragon enemies
- **Rare:** 2% per monster outside boss rooms, 4% under the "infested" omen.
- A paragon is a **gold-skinned** "Paragon <monster>":
  - ×4 hits
  - ×1.8 damage
  - +5 armour
  - +10 skill
  - ×5 experience
  - ×6 gold
- **Guaranteed reward:** 35% a pattern, otherwise rare materials, plus a chance at a plan fragment.
- Shown in gold in fights; the log announces it.

## K. Housing with rent (Endor's rented houses)
- Houses are **rented** from the town clerk. Rent is paid automatically from bank gold once a day (real time).
- After **3 unpaid days** you are evicted and the house stops working. You can rent again later.
- **Moving up**: pay the deposit (two days' rent) and the new rent starts.

| House | Rent/day | Worker slots | Garden yield/hour | XP bonus | Extras |
|---|---|---|---|---|---|
| Cottage | 25 gp | +1 | 2 | +5% | — |
| Townhouse | 90 gp | +2 | 4 | +10% | Home forge (+5% craft success) |
| Stone house | 250 gp | +3 | 6 | +15% | Forge, kennel (pets heal twice as fast, loyalty drops half as fast) |
| Villa | 700 gp | +4 | 10 | +20% | Forge, kennel, alchemy lab (+5% alchemy success) |
| Keep | 2,000 gp | +6 | 16 | +25% | Everything; trophy hall shows achievements |

- **Garden:** herbs and reagents (ginseng, garlic, herb, wheat, flax) delivered to the bank every hour, offline too (capped like workers).
- **XP bonus** applies to all experience while the rent is paid.

## L. More achievements
- **Levels:** 10, 25, 50.
- **Pets:** pet level 10, a pet of level 25.
- **Alchemy:** first potion, 100 potions.
- **Paragons:** slay a paragon, slay 10.
- **Housing:** rent a cottage, own a keep.
- **Patterns and metals:** use a pattern; wear something of each rare metal.
- **Dungeons:** open 10 boss chests; beat a boss under every omen; reach the boss without fleeing once.

## M. Quality of life
- **Auto-repeat:** gather until blocked (UO macro style), and craft a whole batch until materials run out. There's a Stop button.
- **Keyboard:** Space or Enter repeats the main action on the current screen (gather, attack); numbers pick fight actions.
- **Beginner's guide:** a short list of goals for a new character with small rewards:
  - gather 10
  - smelt or cook something
  - craft an item
  - sell to a wanderer
  - enter a dungeon
  - beat a boss
  - tame an animal
  - rent a cottage
- **Clearer feedback:** a "too easy, no gains" hint when a task can't raise a skill any more, and the chance of a gain shown on gather and craft buttons.
