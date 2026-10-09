# The cinematic film: "See what your code stands on."

A pinned, scroll-scrubbed film of Antoni Gaudí's hanging-chain method, performed on Katedrala's real analysis of
CodeVerse. The 91 foundations are set out on a plan; every other source file hangs from the files it depends on, a
weight as heavy as its lines; the 1,369 runtime dependencies pull taut level by level; gravity finds the form; the
lowest weight is named; the model is turned over and stands; load runs down to the foundations; the camera climbs
the longest load path through 16 levels to the crown, where any file can be traced.

The route is `/lab/cinematic/` (`site/app/lab/cinematic/page.tsx`). The component is meant to open the main page:
`<CinematicHero id="top" />`, with any sections after it.

## The idea

Gaudí designed the vaults of the Colònia Güell church upside down: weighted strings hung from a plan, photographed,
then turned over. Chains in tension become arches in compression, so the hanging form is the standing one. A
codebase has the same anatomy: files rest on the files they depend on, down to files that depend on nothing. The
film hangs CodeVerse from those files and turns it over, so a visitor sees, in one gesture, what the code stands on.
Every number on screen is computed from Katedrala's document; the motion is the argument, not decoration.

## Files

| File                                      | Role                                                                                                                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CinematicHero.tsx`                       | Server component: the hero, title block, gauge, captions (visual words plus a transcript), card, text alternative, skip link. Computes every number from the data at build time. |
| `FilmClient.tsx`                          | The client island (about 1 KB gzip). Decides the mode on client navigation, probes WebGL 2, prefetches the film's chunks, mounts and disposes `Film`.                            |
| `mode.ts`                                 | `decideFilmMode` (inlined before the section so the layout is chosen before first paint) and `probeWebGL2`.                                                                      |
| `film.ts`                                 | The director: scroll clock (GSAP ScrollTrigger), camera mass, choreography of words, labels with leader lines, crop marks, tracing, keyboard stops, resize holding, cleanup.     |
| `timeline.ts`                             | The one clock: beats, the opening, keyboard stops, easing, the camera track, the still camera. Pure, shared by server, stage and fallback.                                       |
| `stage.ts`, `shaders.ts`, `sim.ts`        | The WebGL stage (three.js, five draw calls), its GLSL, and the real-time hanging simulation.                                                                                     |
| `fallback.ts`                             | The still drawing in canvas 2D (reduced motion, no WebGL 2).                                                                                                                     |
| `model.ts`                                | The hanging model from `public/data/codeverse-graph.json`: levels, plan, positions, load, summary. Deterministic.                                                                |
| `copy.ts`                                 | Every sentence, with numbers computed from the summary; the text alternative.                                                                                                    |
| `cinematic.module.css`, `film-global.css` | Layout and type; the site navigation's behaviour over the film.                                                                                                                  |
| `LabNav.tsx`, `ReadingNotes.tsx`          | The lab route's bar and the notes that follow the film ("How to read the drawing").                                                                                              |

## The beats

Progress p runs from 0 where the stage pins to 1 where it lets go. The track is 760vh on wide windows (5,940 px of
scroll at 1440 x 900) and 680vh on tall ones (4,895 px at 390 x 844). A wheel notch is about 100 px, so the film is
about 60 notches on a desktop.

| Beat   | p              | px at 1440 x 900 | What happens                                                                                                                            | Words on screen                                                                                                                 |
| ------ | -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Hero   | 0 to 0.034     | 0 to 200         | The plan on its board, the first level already hanging; labels on the two heaviest foundations                                          | "See what your code stands on.", lede, Get started, View on GitHub                                                              |
| Plan   | 0.04 to 0.07   | 240 to 420       | The camera comes down past the edge of the board                                                                                        | "91 foundations, set out on a plan." (0.052 to 0.118)                                                                           |
| Drop   | 0.07 to 0.27   | 420 to 1,600     | Levels 2 to 15 are released one after another: each weight falls, its chains catch it with one rebound, it swings in under its supports | "Every other file hangs from the files it depends on." (0.124 to 0.2), "1,369 runtime dependencies pull taut." (0.206 to 0.292) |
| Hang   | 0.27 to 0.40   | 1,600 to 2,380   | The whole model breathes; the camera leans in                                                                                           | "Gravity finds the form." (0.3 to 0.4)                                                                                          |
| Circle | 0.40 to 0.555  | 2,380 to 3,300   | The camera circles to stand side-on; the crown is labelled                                                                              | "The lowest weight is src/app/page.tsx." (0.412 to 0.545)                                                                       |
| Freeze | 0.555 to 0.59  | 3,300 to 3,500   | The sway dies out; crop marks close round the model like a photograph                                                                   | none                                                                                                                            |
| Turn   | 0.59 to 0.69   | 3,500 to 4,100   | The model turns over in the picture plane; every member flashes load blue at mid-turn; "stands." turns over with it                     | "Turn it over and it stands." (0.594 to 0.686)                                                                                  |
| Load   | 0.69 to 0.745  | 4,100 to 4,430   | A wave of load blue runs from the crown down to the foundations                                                                         | "Load runs down to the foundations." (0.694 to 0.755)                                                                           |
| Zoom   | 0.745 to 0.785 | 4,430 to 4,660   | A dolly push into the base, to the first file of the longest load path                                                                  |                                                                                                                                 |
| Climb  | 0.785 to 0.895 | 4,660 to 5,320   | A crane shot up the longest load path, level by level; the gauge counts +00 to +15; the path is lit, the narration's corner darkens     | "16 levels from the ground to the crown." (0.781 to 0.907)                                                                      |
| Land   | 0.895 to 0.93  | 5,320 to 5,520   | The camera lands on the crown with everything it stands on lit                                                                          | card from 0.914                                                                                                                 |
| Hold   | 0.93 to 1      | 5,520 to 5,940   | The card: the crown's facts and four files to trace                                                                                     | "Hover or tap any file to trace what it stands on."                                                                             |

The opening runs on time, before any scroll, from the stage's first frame: a pen draws the plan round the board in
0.9 s (quadratic ease-out, so ink is on the sheet from the first frame); each foundation lands 50 ms behind the pen
(a 350 ms appearance); the first level is let go at 1.25 s. The headline's words drop in with a damped spring
(900 ms, 70 ms apart, from 140 ms); the lede follows at 520 ms and the actions at 640 ms.

Keyboard: while the film is pinned, Space and Page Down go to the next beat and Shift+Space and Page Up to the
previous one (stops at 0, 0.085, 0.165, 0.25, 0.345, 0.48, 0.682, 0.733, 0.789, 0.895, 0.965, 1), each with its
caption fully shown; past either end and in controls the keys behave as usual. Arrow keys, the wheel and touch
scroll freely.

## Motion decisions

- One authored sequence, scrubbed by the visitor. The camera has a little mass (it follows the scroll with a 140 ms
  time constant and snaps on jumps over 0.2), so a wheel notch reads as a camera move, not a jump cut.
- Easing: authored camera moves are monotone cubic tracks (no overshoot); the turn is a quintic ease-in-out (the
  model has weight); the pen and every entrance ease out; nothing eases in.
- Captions follow one another in one place, so the arriving words wait 110 ms for the leaving ones (130 ms exit):
  a cut, never two sentences printed over each other. Arriving title words drop with the spring the weights use;
  body words fade in 14 ms apart.
- The spring overshoots by 12.6 percent once: the words land like the weights the chains catch. Impeccable's
  detector flags it as bounce easing; it is kept on purpose and used nowhere else.
- Exit faster than entry everywhere: hero 240 ms out and 520 ms in, card 220 and 520, gauge 260 and 500.
- Buttons press to 0.97; hover styles only under `(hover: hover) and (pointer: fine)`.

## Rendering and simulation

- The stage is three.js with five draw calls: the board (hatched band of foundations), its wall (the slab), the
  chains, the lit chains, the joints. Chains are instanced ribbons computed in the vertex shader from a 32-wide
  float texture of positions: catenary sag, slack when a weight is falling, width in screen pixels from the load the
  chain carries, analytic anti-aliasing (no MSAA). Joints are instanced rings, solid discs for the foundations.
- The simulation is real time and written straight into that texture: scroll decides which levels are released,
  physics decides how they move (free fall, a taut catch with one rebound, a pendulum swing in under the supports,
  reeling back in when the visitor scrolls back). It sleeps once nothing moves, and the breathing calms down after
  14 s without input.
- The frame loop draws only when something changes (scroll, physics, a trace, a resize) and stops when the film is
  off screen or the tab is hidden. The pixel ratio is capped at 2 and steps down by 0.5 when the median of 90 frames
  exceeds 21 ms.
- Words are DOM over the canvas: labels with knockout grounds and leader lines placed clear of every other word on
  the frame (a label whose file passes under the words waits until it comes out), crop marks in SVG, the level
  gauge, the card.
- The turn happens in the picture plane (about z on wide screens, about x on tall ones), so the hanging photograph
  turns over exactly as Gaudí's did.

## Honest labels

- From Katedrala's document of CodeVerse (`tedddby/CodeVerse` at `6b942bc`, katedrala 0.1.0, IR schema 1.0.0): the
  404 source files, their lines, and the 1,369 runtime dependencies between them (183 test files left out: no
  source file rests on them).
- Computed for this page from those relationships (`site/scripts/build-codeverse-graph.mjs`, `model.ts`): levels
  (0 to 15), reach (`src/graph/model/types.ts` carries 147 files), the 91 foundations, the crown
  (`src/app/page.tsx`, level 15, depends directly on 1 file, stands on 137 files, 40 of them foundations), the 31
  files nothing depends on, the longest load path.
- Drawn: positions on the plan and under the supports, line weights (lines plus the load hanging below, shared
  equally), the motion. "How to read the drawing" says so, and says CodeVerse is a separate project that Katedrala
  does not depend on.
- The title block carries the status: "Dependency graph, available today". Nothing in the film is planned work.
- No number is typed by hand: every one comes from the data through `summarize()` and `copy.ts`.

## Layouts

Two compositions, split exactly where the camera splits its framings (width / height 0.95): wide (words left,
structure right) and tall (words above and below the structure: phones and tablets in portrait). Short wide windows
(under 560 px high, a phone in landscape) scale the hero, narration, gauge and card to the height. The narration
column is narrow (27rem, 34vw) so every title breaks into at most two balanced lines and stays clear of the drawing.
During the climb, when the camera is inside the structure, the narration's corner takes a darker ground (a
legibility scrim). The gauge and every label knock the drawing out behind them, as lettering on a drawing does.

## Fallbacks and robustness

- Modes: the inline script decides before first paint. Motion allowed and the WebGL 2 API present: the film.
  Otherwise, and when the probe on mount finds no usable context, the still layout: the standing structure drawn in
  canvas 2D with the narration, card and notes in normal flow. The still drawing never downloads three.js or GSAP.
  Without WebGL the title block adds "Drawn without WebGL: the standing structure, still".
- Failures: the data cannot load (the words stay, still layout); the stage chunk cannot load or the renderer cannot
  start (2D still drawing); GSAP cannot load after the first frame (the 2D drawing takes the stage's place and the
  WebGL context is released); the film's script never arrives (the still layout after 12 s, only if the film is
  still in the document).
- Reduced motion: no pinned film, no springs, no dropping words, no camera; tracing still works.
- Keyboard: "Skip the film" (first in the section, shown on focus) jumps to the end of the section at once and moves
  focus there; the beat stops above; Escape clears a trace; the card's buttons preview a trace on focus and keep it
  on press (`aria-pressed`). Once the hero has left the picture its actions stay in the tab order, and focusing one
  brings the hero back over the drawing, so nothing focused is ever invisible.
- Text alternative: the captions are a transcript (an ordered list of whole sentences) that assistive technology
  reads wherever the film is; the visual words are hidden from it. The section is described by a full account of
  the structure (counts per level, heaviest foundations, the crown). A trace kept from the drawing is announced by
  a live region outside the card. Canvas, labels and gauge are hidden from assistive technology.
- Resize and orientation: the film holds its moment while ScrollTrigger measures the new track, then scrolls back
  to the same progress (a phone turned at the climb stays at the climb); the framing, camera and the turn's axis are
  rebuilt. Height-only resizes on touch screens (the address bar) do not interrupt the film.
- No layout shift: the mode is decided before first paint; CLS over load and a full scrub is 0 at 1440 x 900 and
  0.006 at 390 x 844 (the climb label's lines reflowing inside its knockout).
- As one section of a longer page: the pin starts where the film's top meets the top of the window; the site's
  navigation (`.site-nav`, see `film-global.css`) and the lab bar stay clear only while the frame fills the window
  from the bar down, and take their ground as soon as the frame scrolls away or before it arrives; keyboard stops act
  only inside the pinned range.
- Cleanup on unmount: the frame loop, observers, listeners (resize, keys, pointer, visibility, context restore),
  the ScrollTrigger, both WebGL contexts (forced lost when the canvas has left the document), the labels and leaders
  it added, the navigation mark, and every attribute it set on `<html>` (`data-kfilm`, `data-kfilm-ready`,
  `data-kfilm-under`, `data-kfilm-live`).

## Measurements

Indicative: headless Microsoft Edge on this machine (Intel UHD Graphics through ANGLE D3D11, requestAnimationFrame
at about 144 Hz), against the Next dev server. Not a real phone.

Frame times while scrubbing the whole film in 14 s (rAF intervals; "tick" is the film's own main-thread work per
frame: stage, words and labels):

| Window                        | rAF median | rAF p95 | rAF max | Frames over 20 ms | Tick median | Tick p95 | Long tasks |
| ----------------------------- | ---------- | ------- | ------- | ----------------- | ----------- | -------- | ---------- |
| 1440 x 900, DPR 1             | 6.9 ms     | 7.1 ms  | 27.9 ms | 1 of 2,099        | 0.3 ms      | 0.6 ms   | 0          |
| 1440 x 900, DPR 2             | 6.9 ms     | 7.1 ms  | 27.9 ms | 1 of 2,098        | 0.3 ms      | 0.8 ms   | 0          |
| 390 x 844, DPR 3 (stage at 2) | 6.9 ms     | 7.1 ms  | 27.7 ms | 1 of 2,098        | 0.3 ms      | 0.8 ms   | 0          |
| 1440 x 900, 4x CPU throttle   | 7.0 ms     | 13.9 ms | 20.9 ms | 8 of 1,905        | 1.1 ms      | 2.4 ms   | 0          |
| 390 x 844, 4x CPU throttle    | 7.0 ms     | 13.8 ms | 34.8 ms | 8 of 1,948        | 1.1 ms      | 2.2 ms   | 0          |

The most expensive beat is the climb (tick p95 3.9 ms at 4x throttle on the phone: the climb label changes text at
every level and is measured again). Runs vary: across the runs of this pass the maximum frame ranged from 20.8 to
41.6 ms (single frames), the throttled phone had 8 to 25 frames over 20 ms, and the climb's tick p95 3.9 to 4.9 ms.
Medians and p95s did not move.

JavaScript (esbuild production bundle of the same modules, minified, gzip -9):

| Chunk                                        | Raw     | Gzip     | Loaded                  |
| -------------------------------------------- | ------- | -------- | ----------------------- |
| Island (FilmClient, mode)                    | 2.0 KB  | 1.1 KB   | with the route          |
| Director (film.ts)                           | 22.3 KB | 7.8 KB   | on mount                |
| Shared (model, timeline, copy)               | 11.6 KB | 5.2 KB   | on mount                |
| Stage (three.js subset, stage, sim, shaders) | 552 KB  | 140.3 KB | film only               |
| of which stage, sim and shaders              | 23.1 KB | 8.6 KB   |                         |
| gsap                                         | 71.0 KB | 27.7 KB  | film only               |
| ScrollTrigger                                | 44.1 KB | 18.3 KB  | film only               |
| Fallback (2D)                                | 4.0 KB  | 1.9 KB   | still only              |
| Data (codeverse-graph.json)                  | 67.9 KB | 17.2 KB  | preloaded with the page |
| Stylesheet (module)                          | 14.5 KB | 3.7 KB   | with the route          |

Film: about 199 KB gzip of script after mount plus 17 KB of data. Still: about 15 KB gzip of script.

Time to first visible structure (dev server, median of 5 runs, from navigation start):

|                     | First contentful paint | Film starts | Model built | First stage frame | First ink | Plan with foundations |
| ------------------- | ---------------------- | ----------- | ----------- | ----------------- | --------- | --------------------- |
| 1440 x 900          | 372 ms                 | 591 ms      | 615 ms      | 787 ms            | 848 ms    | 980 ms                |
| 390 x 844           | 400 ms                 | 655 ms      | 680 ms      | 873 ms            | 930 ms    | 941 ms                |
| Reduced motion (2D) | 432 ms                 | 642 ms      | 655 ms      | 683 ms            | 842 ms    | 842 ms                |
| No WebGL (2D)       | 392 ms                 | 622 ms      | 644 ms      | 674 ms            | 832 ms    | 832 ms                |

Before this pass (iter14, same harness): first stage frame 1,184 ms, first ink 1,445 ms, plan 1,831 ms. The first
frame no longer waits for GSAP, and the pen starts on the first frame with an ease-out instead of a quintic
ease-in-out that left the sheet blank for a quarter of its run. Marks are in the page: `kfilm:start`,
`kfilm:model`, `kfilm:first-frame`.

## Known weaknesses

- GSAP ScrollTrigger keeps an empty requestAnimationFrame loop alive while it is registered (its repaint workaround),
  also after the film unmounts. The film's own loop sleeps; disabling ScrollTrigger globally would break other
  triggers on the page, so it is left alone.
- Every number above is from headless Edge on one machine against the dev server. Real phones, Safari and Firefox
  have not been measured; the pixel-ratio step-down has never triggered here.
- A browser with the WebGL 2 API but no usable context switches from the film layout to the still one on mount,
  after hydration: nothing moves in the first window, but the page below gets much shorter.
- The film creates two WebGL contexts at start (the probe, released at once, and the renderer's).
- The word-drop spring is a deliberate overshoot that Impeccable's detector reports as bounce easing.
- Labels can blink at the edge of the frame when a swinging file crosses the 40 px visibility margin. It shows only
  after a jump that releases every level at once (a reload mid-film), not in a normal scroll.
- On wider-than-16:10 windows (1280 x 720) the camera's orbit carries the lowest weight under the narration for part
  of its beat; its label then waits for the file to come out rather than point into the caption.
- On a phone in landscape the card's buttons shrink to 32 px (above the 24 px minimum target, below 44 px).
- The card's trace buttons exist only at the end of the film; mid-film, a screen-reader user has the transcript and
  the description, not the tracing.
- The 2D still drawing is faithful but plainer than the WebGL frame (canvas strokes, a simpler ground).
- "Skip the film" without script falls back to the browser's smooth scroll, which plays the film at speed.
- The skip link borrows the site's global `.skip-link` style, and its target's `scroll-margin-top: -5rem` assumes the
  page's 5rem scroll padding.
- The hero lede is the review's verified wording ("reconstructs the architecture inside TypeScript and JavaScript
  code, with evidence for every dependency it finds"); the main page's hero currently reads slightly differently, so
  the promotion has to pick one.
