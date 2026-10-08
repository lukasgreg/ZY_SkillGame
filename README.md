# Ardenhal

A browser game inspired by Ultima Online and the Czech/Slovak shard Andaria. Gather, craft, trade and venture into dungeons. Skills grow from 0.0 to 100.0 in 0.1 steps, fast at first and slow near mastery. English and Czech.

Play: https://lukasgreg.github.io/ZY_SkillGame/ (once GitHub Pages is enabled, see below).

The design plan lives in [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md).

## Run locally

```sh
npm install
npm run dev      # http://localhost:5173/ZY_SkillGame/
npm test         # engine tests (vitest)
npm run build    # type-check and build to dist/
```

In dev builds, the browser console has `__zy.getState()` and `__zy.update(s => …)` for testing.

## Deploy

`.github/workflows/deploy.yml` builds, tests and publishes to GitHub Pages on every push to `master`.
One-time setup in the GitHub repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
On a free plan the repository must be public.

## Layout

| Path | What |
|---|---|
| `src/data/` | Balance data: skills, professions, races, resources, items, recipes, plans, dungeons |
| `src/engine/` | Game rules as plain functions over the save state (tested in `engine.test.ts`) |
| `src/ui/` | Preact components, the store (autosave, clock) and timed actions |
| `src/i18n/` | `en.ts`, `cs.ts` and the translation helper (plurals, Czech adjective gender) |

Saves live in `localStorage` and can be exported/imported from Settings. Save format changes go through `MIGRATIONS` in `src/engine/save.ts`.
