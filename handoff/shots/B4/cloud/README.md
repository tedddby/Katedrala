# B4 cloud scripts (round 1, resumed)

Run from this folder (bare imports resolve to `handoff/shots/node_modules`). Captures go to `out/` (ignored by git).

- `lib.mjs`: open the dev server at a viewport, stitch section captures. `record.mjs <dir>` + `diff.sh <dir>`: innerText,
  aria snapshot and controls of my four plates in B3's baseline format, and the diff against the sealed baseline.
- `chains.mjs [width] [reduced]`: chain motion (explorer kinds, Entropy commits, Rules toggle): settle time after the
  last input, retargeting, keyboard and reduced motion.
- `gravity-check.mjs [width]`: every Gravity term toggle lights exactly its evidence set from metrics.ts and the status
  names the lit members. `cascade-check.mjs [width] [reduced]`: load arriving level by level.
- `explorer-cross.mjs <widths>`: dependencies that run through member or bay names in the Members view.
  `explorer-keys.mjs [width]`: arrow keys through every member at 1.95x zoom keep it inside the sheet.
  `explorer-shot.mjs <w:mode,...>`: the explorer captured with the strip's geometry. `kinds-width.mjs`.
- `svgtext.mjs`, `overflow.mjs`, `reduced-targets.mjs`, `tabwalk.mjs`, `axe-plates.mjs` / `axe-plates2.mjs <widths>`,
  `portrait-max.mjs`, `rules-removed.mjs`. `verify-all.sh` runs the set into `logs/`.
- `sim/`: the explorer layout search. `sync.sh` copies `site/lib/demo/*.ts` with `.ts` imports; `make-build.py` turns
  `plan.ts` into `plan-build.ts` (a function of the authored order, nudges and bends); `anneal4.ts`/`anneal5.ts`
  (simulated annealing scored with the shipped label placement), `cleanup2.ts`/`cleanup3.ts` (drop what a layout
  does not need), `apply-cfg.py` (write a layout into `plan.ts`). The chosen layout is `cleanup-61.txt`.
