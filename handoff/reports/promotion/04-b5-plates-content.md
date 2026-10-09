# B5 plates content

The final report of the "B5 plates content" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

B5 has finished this round's part of plan sections 2.6, 2.8, 2.9 and 2.10, plus the three leftovers assigned to me. The text and accessibility-tree diff against the baseline shows only the listed changes. Two parts wait for next round: adopting the plate kit (it hasn't landed) and the CodeVerse key plan, which needs B1's G1.

## Per plan item

**2.6 History, contact strip** (`History.tsx`, `history.css`)
- Five frames share 1 px gutters on a darker band. At 1024 px and up the band runs to both screen edges, measured in container units so the scrollbar can't cause overflow.
- `v1`…`v5` and the entropy value sit along each frame's top edge. Frames with a finding get a 2 px load-blue mark on that edge, plus their finding text and flagged edge in load blue.
- Each small drawing now has a hatched ground and a support under Platform, with unique pattern ids per drawing.
- History has its own classes (`.history-joint`, `.is-cyclic`, `.history-support`, `.history-ground`, `.history-hatch`) and no longer uses anything from entropy.css.
- The strip's closing edge is drawn outside the last frame, so all five drawings are the same height.
- Phones: a scroll-snap strip with frames `min(80vw, 21rem)`, scroll padding equal to the gutter, and an edge fade instead of a "Scroll" label. The strip takes a Tab stop only while it scrolls.
- Forced colors: the band keeps real top and bottom borders.

**2.8 Developers** (`CommandShowcase.tsx`, `Developers.tsx`, `developers.css`, `lib/demo/commands.ts`)
- **A15 leftover:** the terminal `<pre>` is focusable only while it overflows, and then has `role="region"` and `aria-label="<command> output"`.
- **Print timing:** a pointer choice now prints within 400 ms whatever the length, by shortening the per-line delay for long transcripts. A keyboard choice shows the transcript at once.
- **Guarantees:** now a schedule with one rule between the "available today" and "planned" groups, instead of a hairline under every row.
- **Optional leftover, done:** the analyze transcript gains "unresolved references 155" and "untyped references 2,055".
  - Both numbers are read from `codeverse-evidence.json` `stats`, not typed by hand.
  - A check confirms that file describes the same analysis as `CODEVERSE_ANALYSIS`. A mismatch fails the production build and only logs in dev, so it can't break other builders' sessions.
- The terminal was already in columns 5 to 12 with the active joint in load blue, so nothing changed there.

**2.9 Open source, construction gauge** (`OpenSource.tsx`, `open-source.css`)
- The dot row and the 15-row hairline table are replaced by a gauge standing on hatched ground.
- The DOM keeps the ordered list 01 to 15; CSS draws it bottom-up, with the numbers always shown.
- The staff is chalk from the ground up to milestone 04 and graphite scaffolding above. Done ticks are chalk, planned ticks graphite, and the in-progress tick (13) is 2 px load blue.
- The old image's accessible name "4 milestones done, 1 in progress, 10 planned" is now the list's name.
- The facts lose their per-row hairlines and are held to a 60ch measure.

**2.10 Ecosystem, structural elevation** (`Ecosystem.tsx`, `ecosystem.css`)
- Each tool's status mark is the capital of its column. Shafts are solid when available, dashed when planned, and only their two ends when after v1. Joints are filled when available.
- Name, text and capital rows are aligned across all five columns (CSS subgrid) from 768 px.
- The beam, the Katedrala slab, the layer rules and the hatched ground run to both screen edges.
- Phones: separate columns. Each tool steps one 1rem lane right, and the columns of the tools above run down beside it to their own joints on the beam.
- Hover (fine pointer only) lights that tool's shaft, capital and joint. This is drawn, not a coloured side border.
- **Leftover:** the CI copy now reads "Will fail a build when a change breaks a rule."
- `.cta-title` and `.cta-ground` (used by B3's FinalCta) are kept unchanged in this file.

## Files changed
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/History.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/Developers.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/CommandShowcase.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/OpenSource.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/Ecosystem.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/lib/demo/commands.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/app/styles/history.css, developers.css, open-source.css, ecosystem.css

`lib/demo/history.ts` is unchanged. Scripts and captures are in C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/B5/ (`after-r1/` is B3's recorder run, `final/` and `r1`–`r5/` are captures).

## Items for other owners
- **B2:** `commands.ts` reads these keys from `codeverse-evidence.json`; please keep them: `source.repository`, `source.commit`, and `stats.analyzedFiles`, `symbols`, `edges`, `unresolvedImports`, `unresolvedReferences`, `untypedReferences`. (`stats.files` was already removed mid-round, and I adapted.)
- **B3:**
  - When Section's `status` prop lands, I'll move History and Developers off `aside` next round.
  - The Ecosystem capitals assume Status's 8 px square on a 1rem line; please tell me if the mark's size changes.
  - `.status` now wraps, so at 768 to 799 px "Planned after v1" breaks onto two lines. I handled that.
  - `.cta-title` and `.cta-ground` can move out of ecosystem.css whenever you like.
  - `.ground-hatch` disappears in forced colors; the ground line stays.
- **B4 (affects B3's 320 px header leftover):** with the text-spacing override at 320, the page is 348 px wide because of `.term-vector-mark` in Gravity (right edges 413 to 488 px) and Entropy (339 to 366 px). None of my elements cross an edge.

## Measurements
- **1440:** section heights are History 982, Developers 1449, Open source 1166, Ecosystem 1224 (baseline 974, 1449, 1204, 1211). These include B3's new 158.4 px section padding.
- **390:** History 908, Developers 1966, Open source 1664, Ecosystem 2093 (baseline 877, 1971, 1751, 2137).
- **History:** frames are 264 px at 1440 and 312 px at 390; the strip is 406 px tall.
- **Gauge:** 570 px tall, rows 38 px (60 px when a name wraps on phones).
- **Ecosystem:** shafts 76 px at 1440. Phone joints sit 16 px apart, at x = 20, 36, 52, 68, 84.

## Acceptance (plan 4.6)
1. **Baseline diff shows only the listed changes: pass.** I compared text, aria tree and controls at 1440 and 390, using B3's recorder plus a final re-check.
   - History: identical.
   - Developers: the two new analyze rows, and the terminal is no longer a Tab stop where nothing scrolls.
   - Open source: the dot-row image is gone and its name moved to the list.
   - Ecosystem: the CI line.
2. **Tablist APG and transcript timing: pass.** The tablist is unchanged and wraps 3+2 on phones. Pointer prints finish at 388, 372 and 308 ms. A keyboard choice shows the transcript at once, and under reduced motion the animation is `none`. The terminal is a region only while it overflows ("health output" and the others at 390 and 320; never at 768 or 1440).
3. **History renders identically without entropy.css: pass.** None of entropy.css's 34 selectors match any History element. With its 43 rules deleted from the live page (History isolated), 0 pixels differ at 1440 and 390.
4. **Key plan: not started.** It needs B1's G1 and is next round.
5. **axe 0, detector `[]`, phone forms: pass.**
   - axe: 0 violations at 1440, 768 and 390, default and reduced motion. The contrast checks axe couldn't decide all compute to 5.47:1 or higher.
   - Detector: `[]`.
   - Phone forms are as specified, except the key plan.
   - Also clean: no horizontal overflow at 13 widths from 320 to 1920 or with text spacing; Tab walk visible with 2 px load-blue rings and nothing under the header; forced colors checked; console clean.
   - `tsc` reports no errors in my files (the remaining ones are in B1's in-progress `components/stage/`); prettier is clean.

There was no user to ask, so I took the design direction from the plan and the user's confirmed decisions. Impeccable v4.5.1 is available (installed 4.5.0); updating it needs the user's own request.
