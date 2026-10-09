# B3 baseline

The final report of the "B3 baseline" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

GB is met: the baseline is complete, it matches the page as served now, and it is sealed. B4 and B5 can start editing existing page files. Nothing in `site/` or the repository was edited.

## Plan 4.4 item 1 (the baseline)

**State of the earlier attempt.** It had finished the whole capture: the review copy, the source copy with hashes, the 1440 and 390 records and `record.json`, all written between 02:12:48 and 02:23:50 (+03:00). It stopped before checking the capture against the page and before sealing it.

**Check against the current page**, done today 16:54 to 16:56 by re-running the same recorder into `scratchpad/shots/B3/verify-1655/`:
- **Text:** every `.txt`, `.aria.yml` and `.controls.txt` is identical at both widths, as are `tab-order.txt` and the 390 menu files.
- **JSON:** identical except `tab-order.json`. There only the focus-ring colour differs, because it was sampled mid-transition (3 stops at 1440, 5 at 390). Every role, name, order and position is the same.
- **Screenshots:** all 39 PNGs are pixel-identical (0.000%).
- **Source and review copies:** all 75 hashed page files are unchanged, and the 32 files in `review/` are identical to `site/.impeccable/review/`.
- **Visual check:** contact sheets of every capture show each section complete, with no blank bands.

**Completed in this run:**
- `extra/`: extra "before" records for checks my later items depend on: anchors, typography, the five-pass layout at 7 widths, my own sections at 768, 1024, 1280x720 and 844x390, and the header at 320 px.
- `index.json`: what every file is, plus the verification results.
- `manifest.sha256` and `manifest.json`: 436 files sealed; `sha256sum -c` passes.

## Where everything is
Root: `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/lab/promotion/baseline/`
- `review/`: the 32 post-fix captures.
- `source/` and `source-sha256.txt`: the 75 page source files. Every import inside the copy resolves.
- `1440/` and `390/`, for each of the 16 units (skip-link, header, top, how-it-works, architecture, gravity, entropy, impact, rules, evidence, history, developers, open-source, ecosystem, get-started, footer):
  - `<unit>.txt` (innerText)
  - `<unit>.aria.yml` (Playwright ariaSnapshot)
  - `<unit>.controls.txt` and `.controls.json` (role, name and state of every control)
  - `<unit>.png`
- Also per width: `first-viewport.png`, `full-page.png`, `page.txt`, `page.aria.yml`, `page.json`, `geometry.json`, `nav-states.json`, `tab-order.txt`/`.json`, `header-scrolled.png`, `skip-link-focused.png`, `console.txt`. At 390 also `menu-open.*` and `menu-behavior.json`.
- `extra/`: `anchors.json`, `typography-1440.json`, `typography-390.json`, `hinge/<w>x<h>.json|png`, `widths/<w>x<h>/`, `header-320/`, `record.json`.
- `index.json`, `record.json`, `manifest.sha256`, `manifest.json`.

Scripts are in `scratchpad/shots/B3/`: `baseline.mjs`, `extras.mjs`, `contact.mjs`, `manifest.mjs`, `sheets/`, `verify-1655/`.

## Files changed
None in `site/` or the repository. The only new files are the scratchpad ones listed above.

## Items for other owners (recorded before-state)
- **B4 (and my own `status.css`), for the 320 px header leftover:** with the WCAG text-spacing override at 320, content wider than the screen widens the page to 342 px. The fixed header widens with it and the Menu button is cut 6 px. The causes are the Rules `figure.violation` (right edge at 342.3 px) and the Gravity and Entropy status marks "Katedrala heuristic, planned for v1" (335.5 px, set to `nowrap` in `status.css`).
- **B5:** the terminal `<pre>` is a Tab stop at both widths (stop 27 of 44 at 1440, 21 of 39 at 390), with role generic and no name. This confirms the A15 leftover.
- **Me, later (link check):** the page's only external URL with a fragment is `https://github.com/tedddby/Katedrala#get-started`.

## Measurements
- **Page height:**

| Viewport | Height (px) | Viewports |
|---|---|---|
| 1440x900 | 15,158 | 16.84 |
| 390x844 | 21,054 | 24.95 |
| 768x1024 | 18,802 | |
| 1024x768 | 14,195 | |
| 1280x720 | 14,713 | |
| 844x390 | 18,952 | |

- **Tab walk:** 44 stops at 1440, 39 at 390. None sits under the header, none is off screen, and every one shows a focus ring. Console is clean.
- **Navbar:** transparent at the top of the page and solid from 96 px of scroll.
- **Menu at 390:** the toggle is 70x44 and each link 206x47. Escape, an outside press, choosing a link and tabbing away all close it.
- **Final headline:** wdth 80; 81.76 px on 2 lines at 1440, 44 px on 3 lines at 390.
- **Five passes:** no overlap, overflow or clipped text at 390, 768, 1024, 1180, 1280, 1350 and 1440.
- **Anchors:** 13 section ids, no missing in-page targets, no duplicate ids.

## Acceptance (plan 4.4)
- **"The baseline exists before the first edit (timestamps)": pass.**
  - Baseline files were created 02:12:48 to 02:23:50; the extra records 17:04 to 17:09.
  - No file under `site/` (excluding `node_modules`, `.next` and `out`) was modified after 02:06:59. That file is `next-env.d.ts`, written by the dev server; the newest page file is `OpenSource.tsx` at 00:42:50.
  - All 75 page files still matched their hashes at sealing.
- The other B3 acceptance items belong to items 2 to 4 and are not tested in this phase; their before-state is recorded above.

I did not read the design skills or craft-floor and did not run the Impeccable `context` command, because this phase makes no UI edit; I'll do both before item 2. The dev server at port 3100 was already running and answered.
