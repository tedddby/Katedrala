# B3 kit and shell

The final report of the "B3 kit and shell" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

**B3 round report: the plate kit (gate G2), the hinge plate, the final statement, the footer, the layout head and skip links**

The plate kit is in place, its API is stable, and B4 and B5 can adopt it now. Everything this round asked of me is built and verified on the dev server. The navbar's film-awareness waits for next round, as planned. The whole site type-checks with no errors, the Impeccable detector returns `[]` for `app components lib`, axe finds 0 violations, and every file I changed is prettier-formatted.

One change from the plan: the hinge's heading sits above the passes instead of in columns 1 to 4, and the plate came out longer than planned (1.55 viewports at 1440 instead of 1.1). Details under item 3a.

## Plan 4.4 item 2: the plate kit and tokens (G2)
- **Tokens in `base.css`:**
  - `--text-gauge`, the film's gauge size; Tailwind gives it a `text-gauge` class.
  - `--ease-spring`, the film's damped-spring curve (`ease-spring` class). Use it only for chains dropping in and the film's words, never for controls.
  - `--plate-pad`, the space above each plate: clamp(6.5rem, 11vw, 10.5rem).
  - `--col-gap`, the 12-column gap; `.grid-12` now uses it.
  - One z-index scale: the film's layers `--z-film-drawing` to `--z-film-words` (0 to 4), `--z-nav` (40) and `--z-skip` (60).
  - `html[data-kfilm="film"] { scroll-behavior: auto }`, so jumps don't play the film at speed.
- **Section:** a new `status` prop puts the status marks on their own line under the h2, before the lede. The old `aside` prop still works exactly as before until G5. Every `.section` now has the plate padding and is a size container.
- **`plates.css` (new):**
  - `.sheet`: crop marks, 12 px arms, 1 px, in the faintest ink.
  - `.titleblock`: the film's mono micro type on a knock-out ground.
  - `.status-line`.
  - Bleed utilities: `bleed-left`, `bleed-right`, `bleed-x` and `bleed-none`. They work with breakpoints (for example `lg:bleed-right`), and a bleeding side drops its two crop marks. The bleed distance is measured without the scrollbar.
  - `.gauge-numerals`, `.leader-label` and `.leader`, plus forced-colors rules.
- **Components:**
  - `<Plate titleBlock as="div|figure" ref className …rest>`
  - `<TitleBlock subject fact status place="auto|overlay|below">`. By default the title block sits under the drawing on phones and over its bottom right corner from 768 px.
  - `<CropMarks/>`
- **Rule for adopters:** put `role="img"` on the drawing inside a Plate, never on the Plate itself. An image's children are hidden from screen readers, so the title block would not be read.
- **Specimen route:** `/lab/kit/` shows every piece. It's temporary and goes when the lab is deleted at G5.

## Plan 4.4 item 3
**a. Hinge plate (`Pipeline.tsx`, `pipeline.css`)**
- **Composition:**
  - A full-width hatched board labelled "Source code".
  - One chain hangs from it in column 1 and runs past the heading to Parse.
  - Parse and Link are solid discs on solid chalk chains; Infer, Analyze and Explain are open rings on dashed graphite chains.
  - Each length of chain is as thick as the passes hanging below it: 3 px at the top down to 1 px.
  - From 768 px each pass is a row: number, verb, its status on the verb's line, then the text. What the pass adds to the document sits from column 9 at 1024 px and wider, and under the text below that. No motion.
- **Data:** the Parse and Link artifacts come from `codeverse-evidence.json` and the build stops if the file and `REAL_EDGE` disagree. Parse reads cache-key.ts, 4 symbols, function graphCacheKey. Link reads calls, from createAnalysisService, to graphCacheKey, at analysis-service.ts:219. The footnote is the plan's text.
- **Why the heading moved:** in four columns the lede runs three lines at 1440 (measured), and D5 allows two at most. So the heading sits above the passes in columns 2 to 8, where it takes two lines and the lede two. As a result, the hinge's heading starts one column in from the shared left edge.

**b. Final statement (`FinalCta.tsx`):** the headline uses the display style (width 78), followed by the lede, the two buttons ("Get started" keeps its hidden " on GitHub" for screen readers), and a full-width hatched ground band. Its styles moved into my `sections.css`.

**c. Footer:** laid out as a drawing's title block, with hairline cells. The links and texts are unchanged; only "MIT licensed." is set in mono, on its own line.

**d. Layout head and skip links:** the head keeps the data-js script and now runs B1's `FILM_MODE_SCRIPT` after it. On a page without the film it leaves nothing behind (checked on `/`, `/lab/cinematic/` and `/lab/kit/`). "Skip the film" (to `#how-it-works`) only appears on pages that have both `#film-start` and `#how-it-works`. With the film simulated on the page, it's the second Tab stop, shows on focus, and lands the board clear of the nav.

## Leftovers from the fix pass
- **`check-links.mjs`:** it now checks that link fragments exist (README and Markdown heading ids, other pages' ids, and the page's own `#id` links).
  - It now fails on `https://github.com/tedddby/Katedrala#get-started`, because the public README has no "Get started" heading yet. That's correct: the launch gate stays open until the user pushes the README section.
  - A fixture confirmed that real headings pass (`#why`, `ROADMAP.md#v1-milestones`).
- **320 px header with WCAG text spacing:** fixed. Status labels now wrap beside their square instead of running past their column, and headings let an over-long word break.
  - The header is now 320 px wide with nothing cut; it was 342 px with the Menu button cut 6 px.
  - A bisect found the only remaining cause was the hinge heading, so the Rules figure no longer contributes.

## Files changed (all under `C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/`)
- **New:** `app/styles/plates.css`, `components/ui/Plate.tsx`, `components/ui/TitleBlock.tsx`, `components/ui/CropMarks.tsx`, `app/lab/kit/page.tsx`
- **Changed:** `app/layout.tsx`, `app/globals.css`, `app/styles/base.css`, `app/styles/sections.css`, `app/styles/status.css`, `app/styles/pipeline.css`, `app/styles/nav.css`, `components/ui/Section.tsx`, `components/ui/Status.tsx` (label wrapped in a span), `components/sections/Pipeline.tsx`, `components/sections/FinalCta.tsx`, `components/site/Footer.tsx`, `components/site/Navbar.tsx` (z-index token only), `scripts/check-links.mjs`

## Items for other owners
- **B1:**
  - The layout now renders "Skip the film" with `data-film-skip`, so the film must not render its own at the switch. The preview route's link to `#film-end` is fine until G5.
  - The preview route's inline copy of the mode script is now redundant (harmless).
  - The new tokens can replace `--k-spring` and the film's own z-index values; `film.module.css:871` uses z-index 5, outside the 0 to 4 scale.
- **B4 and B5:** adopt the kit next round by replacing `aside` with `status`. The plate padding and containers are already live; the only elements whose containing block changed are `.sr-only` spans.
- **B5:**
  - `.cta-title` and `.cta-ground` in `ecosystem.css` are now unused; remove them.
  - At 768 px the two Ecosystem "Planned after v1" marks wrap to "Planned / after v1" in their 129 px columns.
- **Copy audit:** apostrophes are mixed across the page. The film and the hinge use ’, while Evidence, Gravity and Rules use a straight '. I kept the footer label "Architecture document" because the plan says to keep the footer texts.

## Measurements
| | Baseline | Now |
|---|---|---|
| Hinge at 1440 | 905 px (1.01 vh) | 1,394 px (1.55 vh) |
| Hinge at 390 | 2,034 px (2.41 vh) | 1,807 px (2.14 vh) |
| Final statement at 1440 / 390 | 665 / 531 px | 681 / 551 px |
| Footer at 1440 / 390 | 271 / 565 px | 340 / 572 px |
| Page at 1440 (old hero still in place, includes others' edits) | 15,158 px | 15,987 px |

Other widths for the hinge: 1.65 vh at 768 and 1024, 1.61 at 1180, 1.87 at 1280x720, 1.53 at 1350.

## Acceptance (plan 4.4)
- **Baseline before the first edit:** pass (sealed last round, before any edit).
- **Nav (film-transparent background, menu behaviour, 44 px targets):** next round. The header's text and accessibility tree are unchanged this round.
- **Hinge plate:** pass. No row overlaps and nothing overflows at 390, 768, 1024, 1180, 1280, 1350 and 1440 (also checked at 320, 1023 and 1920). Every length of chain meets its weights with 0 px error, and the Parse and Link artifacts match the evidence JSON exactly.
- **Final headline:** pass. Width axis 78; 2 lines at 1440 and 3 at 390; the hidden " on GitHub" is on "Get started" only.
- **Type-check, deleted imports, detector:** pass. Whole-site type-check has 0 errors and the detector returns `[]`. Deletions come at the switch.
- **Copy and accessibility-tree diff against the baseline:** pass.
  - Header and final statement: identical.
  - Hinge: only the listed changes (artifacts, footnote, and the board label, which is hidden from screen readers).
  - Footer: accessibility tree identical; innerText differs by one line break.
  - "Skip the film": present in the page but hidden and excluded from the accessibility tree until the film is on the page.
- **Also checked:** axe 0 violations at 1440 and 390 (touch) with disclosures closed and open; forced colors (dark and light) keep the chain and its weights visible.

Scripts and captures are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/B3/`. Final captures are in `final/` (`hinge`, `hinge2`, `ending`, `diff`, `kit`, plus the axe, status-mark and 320-header results); working captures are in `r1/`.
