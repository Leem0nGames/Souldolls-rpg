# AGENTS.md — SoulDolls RPG

Working notes for any AI agent (or human) touching this repository.
Read this before changing art, data or the render pipeline.

---

## 0. Commands

```bash
npm run dev            # vite dev server (port 3000)
npm run lint           # tsc --noEmit  (this IS the lint)
npm run build          # production build

npm run bake:sprites   # cookies las hojas de personajes -> WebP con alfa
npm run bake:props     # cookies los props del mapa -> PNG con alfa
npm run soul:harness   # analiza + hornea + informa del estado de las hojas
```

`npm run lint` must stay green before every commit. The build must stay green too.

---

## 1. Sprite sheets (the dynamic folder)

The character artwork lives in a **dynamic folder**: new JPGs can be dropped in
at any moment.

```
public/assets/souldolls/
  manifest.json          <- SOURCE OF TRUTH: which sheet belongs to which species
  <id>.jpg               <- the original artwork (never modified)
  <id>.webp              <- baked by the harness: same sheet, alpha mask, ~40% smaller
```

### The flow, step by step

1. **Drop** a JPG in `public/assets/souldolls/` (1024x1024, two views: back on
   the left half, front on the right half).
2. **Run** `npm run soul:harness`. It
   - registers any new JPG in the manifest (unassigned),
   - analyses every sheet (size, detected backdrop colour, one or two views,
     whether it already has an alpha mask),
   - bakes the missing WebP,
   - regenerates `src/game/data/souldollSheets.ts`,
   - writes a preview of every sheet in `.harness/preview/`,
   - prints a report with the assigned sheets, the new ones, the species that
     still have no artwork (with a ready to paste template) and any warning.
3. **Interpret** the new sheet: decide which species/tier it belongs to, its
   name, its types and its evolution. Look at the preview PNG.
4. **Assign** it:
   ```bash
   npm run soul:harness -- --assign green_cromakey_background_20261022114114 ignisaur
   ```
   This updates `manifest.json`, re-bakes and regenerates the mapping. The
   first sheet of the manifest for a species is the one that wins.
5. **Add the species data** in `src/game/data/souldolls.ts` (name, types, stats,
   learnset, evolution, colorTheme). The harness prints a template.
6. **Verify**: `npm run lint && npm run build`, then check the game.

### The backdrop colours

The sheets are JPGs, so the backdrop is *painted in*. The harness measures it
from the border of every sheet and keys it out.

| Sheets | Backdrop | Tolerance |
|---|---|---|
| SoulDoll sheets (dark) | `#19191E` (rgb 25,25,30) | 26 |
| Player sheet | `#FFFFFF` | 34 |
| **Green screen sheets** | detected automatically | chroma key |

A sheet that already ships with an alpha channel is detected and used as is
(`hasTransparentBackground`). The colour key lives in
`src/game/graphics/BackgroundKey.ts`; **never** key by luminance: that eats the
black collar, the boot soles and the straps of the characters.

### Green screen (chroma key) sheets

When the backdrop is a green screen the harness switches to `removeChromaKey`:

- the green is detected by dominance (`g > max(r,b) * 1.45`), so the different
  exposures of the same green are removed as well,
- the matte around the character is always taken back with the character's
  colour (no green spill on the edges),
- a final **despill** removes the excess of green from the pixels close to the
  outline.

The green inside the flames is part of the artwork and is left alone.

### Species and sheet mapping

`src/game/data/souldollSheets.ts` is **generated** by the harness, do not edit
it by hand. It maps every sheet to the species that owns it; the species
without their own sheet share the generic ones (chosen with a stable hash of
the id).

Current line of fire:

| Tier | Species id | Name | Types | Sheet (cromakey verde) |
|---|---|---|---|---|
| 1 | `ignisaur` | Tomo | Fire | `green_cromakey_background_20261022114114` |
| 2 | `pyrodrake` | Tomoe | Fire / Shadow | `green_cromakey_background_20261022114146` |
| 3 | `tomomusashi` | Tomoe Musashi | Fire / Light | `green_cromakey_background_20261022114207` |

---

## 2. Overworld map

The map is a tilemap baked from the Gen 2 inspired tileset
(`nikouu/Pokemon-gen-2-style-tilemap`, MIT, original artwork in `Custom/`).

```
public/tilesets/overworld/   <- the tileset (8x8 tiles) + LICENSE + README
src/game/graphics/OverworldTiles.ts   <- the grid, the transitions, the layout
src/game/graphics/OverworldProps.ts   <- the billboards (trees, rocks, flowers)
public/assets/props/         <- the baked props with alpha
```

- 1 tile = 1.5 world units, the map is 40x40 tiles (60x60 units).
- The whole ground is **one canvas** baked at runtime and used as the texture
  of a single plane (one draw call).
- **Transitions**: the grass is dithered over the path and over the tall grass
  with a 50% checkerboard.
- The props are **billboards** (sprites) so the player walks behind them.
- The trees block the player (slide collision), the rest of the props do not.
- The important places stay clear: shrine, tamers and the spawn.

Adding a new prop: drop the tile in the tileset, bake it in
`tools/bake-props.ts` (key the grass with a flood fill, never with a flat
colour key) and add its size to `PROP_DEFS` in `OverworldProps.ts`.

---

## 3. Battle VFX

```
src/game/graphics/BattleVfx.ts         <- the typed bridge (no Three.js)
src/game/graphics/BattleVfxDirector.ts  <- the effects
```

- The combat rules never depend on Three.js: `BattleUI` asks for an effect and
  awaits the `impact` frame, and applies the HP change there.
- Every move of `MOVES_DATABASE` has its own signature
  (`MOVE_SIGNATURE`) and every element has its own silhouette
  (`drawGlyph`).
- A watchdog guarantees the promise resolves even if WebGL is missing, so the
  battle can never stall because of the visuals.

---

## 4. Conventions

- The UI is in Spanish, the code comments and the docs in English.
- Pixel art: `NearestFilter`, no mipmaps, `SRGBColorSpace`.
- Anything that allocates per frame is forbidden in the render loops.
- The software WebGL fallback halves the amount of particles.
- The battle arena lives at Y = -50; the VFX group is parented to
  `battleArenaPlatform` so every effect is authored in arena local space.

---

## 5. Golden rules

1. `npm run lint` and `npm run build` must be green.
2. Never commit `node_modules`, `dist` or `package-lock.json` (the project uses
   `bun.lock`).
3. New artwork goes through the harness, never by hand editing the WebPs.
4. If a change touches the art pipeline, update this file.
