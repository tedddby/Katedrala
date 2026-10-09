# The film: "See what your code stands on."

The page opens on one pinned, scroll-scrubbed film performed on Katedrala's real analysis of CodeVerse, in three
acts and a landing:

1. **Act I, "See what your code stands on."** (`hang.ts`): Antoni Gaudí's hanging-chain method. The 91 foundations
   are set out on a plan; every other source file hangs from the files it depends on, a weight as heavy as its
   lines; the 1,369 runtime dependencies pull taut level by level; gravity finds the form; the lowest weight is
   named; the model is turned over and stands; load runs down to the foundations; the camera climbs the longest load
   path through 16 levels and holds on the crown.
2. **Act II, "Every conclusion has evidence."** (`acts/evidence.ts`): one real dependency, down to its lines of code.
3. **Act III, "Know what a change will touch before you make it."** (`acts/change.ts`): a change rises from a
   foundation through everything that rests on it. Impact analysis is planned for v1, and the act says so throughout.
4. **The landing, "Trace any file."** (`acts/landing.ts`): any of the 404 files, in both directions.

Acts II, III and the landing are built in `acts/` (their own owner); this README covers the engine they run on.
The preview route is `/lab/cinematic/` until the film opens the main page (`<Film />`, then the sections).

## The idea

Gaudí designed the vaults of the Colònia Güell church upside down: weighted strings hung from a plan, photographed,
then turned over. Chains in tension become arches in compression, so the hanging form is the standing one. A
codebase has the same anatomy: files rest on the files they depend on, down to files that depend on nothing. The film
hangs CodeVerse from those files and turns it over, so a visitor sees, in one gesture, what the code stands on.
Every number on screen is computed from Katedrala's document; the motion is the argument, not decoration.

## Files

| File                                                      | Role                                                                                                                                                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Film.tsx`                                                | Server shell: the section, the hero frame (h1, lede, actions), the title block, Act I's visual captions and narration, the acts' layers, slots and anchors, the track's length.                                      |
| `FilmClient.tsx`                                          | The client island (about 1 KB gzip): decides the mode on client navigation, probes WebGL 2, prefetches the film's chunks only once the probe has passed, mounts the director (film) or the still controller (still). |
| `mode.ts`                                                 | `FILM_MODE_SCRIPT` (the layout puts it in `<head>`), `decideFilmMode`, `probeWebGL2`.                                                                                                                                |
| `timeline.ts`                                             | The one clock: `ACTS`, `clockOf(framing)` (act spans, `at(P)`, `progressOf`, stops, anchors), Act I's `BEAT` table and opening, easing, the camera keys and cameras. Pure: the server sizes the track with it.       |
| `act.ts`                                                  | The act interface (below). Types only.                                                                                                                                                                               |
| `hang.ts`                                                 | Act I as an act: camera keys, lighting, overlay (hero, turning word, crop marks, gauge, labels, the plan's folders); the default trace every act inherits.                                                           |
| `registry.ts`                                             | The acts in order: Act I, then `acts/index.ts`, paired with their timings by id.                                                                                                                                     |
| `director.ts`                                             | Film mode: scroll clock (GSAP ScrollTrigger), camera mass, act dispatch (camera, lighting, captions, overlays), labels, page keys, resize holding, cleanup.                                                          |
| `still.ts`                                                | Still mode: every act's still figure in Canvas 2D (`fallback.ts`), at most two holding pixels, tracing, no three.js and no GSAP.                                                                                     |
| `stage.ts`, `shaders.ts`, `sim.ts`                        | The WebGL stage (three.js, five draw calls), its GLSL, the real-time hanging simulation. The camera comes from the director.                                                                                         |
| `fallback.ts`                                             | The 2D drawing: any camera (`setCamera`), any lighting (`LitMask` with its dim), picking, screen positions.                                                                                                          |
| `labels.ts`                                               | Labels on the drawing: placement clear of the frame's words, leaders; the handle acts get.                                                                                                                           |
| `links.ts`                                                | "Explore Katedrala" and "Skip the film" with the scroll each needs; the navigation mark (`data-kfilm-under`).                                                                                                        |
| `model.ts`, `codeverse.ts`                                | The hanging model from `public/data/codeverse-graph.json` (levels, plan, positions, load, the plan's directories, summary). `codeverse()` is the server's cached copy: server only.                                  |
| `copy/hanging.ts`, `copy/legend.ts`                       | Act I's words and the legend's, every number from the summary.                                                                                                                                                       |
| `Legend.tsx`                                              | The drawing's key and "How to read the drawing", for the landing.                                                                                                                                                    |
| `StillFigure.tsx`                                         | An act's figure in the still layout, placed in the act's block.                                                                                                                                                      |
| `film.module.css`, `legend.module.css`, `film-global.css` | Layout and type; the site navigation over the film (until `styles/nav.css` carries those rules).                                                                                                                     |
| `acts/`                                                   | Acts II, III and the landing (their owner's): `timing.ts`, `index.ts`, the act modules, `trace.ts`, `payload.ts`, `copy.ts`, the server markup, `acts.module.css`.                                                   |

## The clock

Global progress P runs from 0 where the stage pins to 1 where it lets go. Each act has a pinned length in viewports
per framing (`ActTiming.length`: Act I 6.6 wide and 5.8 tall, its prototype length; the others from `acts/timing.ts`),
and the clock lays them end to end:

| Framing           | Act I                   | Act II     | Act III     | Landing      | Pinned | Track          |
| ----------------- | ----------------------- | ---------- | ----------- | ------------ | ------ | -------------- |
| wide (1440 x 900) | 0 to 6.6 (P 0 to 0.589) | 6.6 to 8.6 | 8.6 to 10.4 | 10.4 to 11.2 | 11.2   | 12.2 viewports |
| tall (390 x 844)  | 0 to 5.8 (P 0 to 0.563) | 5.8 to 7.7 | 7.7 to 9.5  | 9.5 to 10.3  | 10.3   | 11.3 viewports |

`clock.at(P)` is contiguous and monotone over [0, 1] (spans are half open; P 1 is the landing's t 1) and
`progressOf(at(P))` returns P exactly. The server writes both framings' lengths on the track (`--k-track-wide`,
`--k-track-tall`) and every act's anchor and start (`--k-at-*`, `--k-from-*`); the stylesheet picks one with the
same aspect split the camera uses (0.95). The framing is always the window's, `timeline.ts TALL_MEDIA`
(`(max-aspect-ratio: 949/1000)`), in the stylesheet, the director and the still controller alike, so words and drawing
are composed for the same framing (the still layout's frame is capped at 64rem, so its own aspect is not the
measure). Act I's local t is exactly the prototype's progress, so its beats (below) are unchanged.

The camera is one monotone cubic track over every act's keys in global P. Each act's first key is the previous
act's last (the director passes it as `from` and enforces it), so the camera never cuts, and the curve stays smooth
through the boundary.

## The act interface (`act.ts`)

An act has three parts.

- **Timing** (`ActTiming`, pure data): `id`, `length {wide, tall}` in viewports, `stops` (local t for Space, Page
  Down and Page Up), `anchor` (local t where its anchor lands, its first caption in full view). Act I's is
  `timeline.ts HANG`; the others' are `acts/timing.ts ACT_TIMINGS`. The server reads them; `timeline.ts ACTS` joins
  them.
- **Behaviour** (`ActDefinition`, registered in `acts/index.ts LATER_ACTS`):
  - `cameraKeys(model, framing, from)`: `[t, yaw, pitch, distance, tx, ty, tz, fov, lensX, lensY]` keys in local t,
    first at t 0 (equal to `from`), last at t 1. World space is the standing structure (ground y 0, crown up).
  - `lit(t, model)`: a `LitMask` (`nodes` per file, `edges` per chain, `dim` 0..1) or null. Return the same object
    while nothing changes: masks are uploaded only when the object changes.
  - `emphasis?(t)`: 0..1, every chain brightens in chalk.
  - `traceOf?(v, model)`: how a traced file is lit and its label's sentence; the default lights what it stands on (a
    foundation: what rests on it). A trace (hover, or a pin) always wins over `lit()`.
  - `mount?(ctx)`: an `ActOverlay` with `update(t)` (local t, unclamped: below 0 before the act, above 1 after) and
    `dispose()`. Mounted once per mode.
  - `still`: `{ camera(model, framing), lit(model), t }` for the still layout, or null.
- **Markup** (server components in `acts/`): `<Name>Act` is the block, placed in the act's slot; `<Name>Frame` is its
  words over the drawing, placed in its layer.

`ActContext` gives an act: `mode`, `id`, `root`, `frame` (the element the drawing fills; overlays use its CSS px),
`layer` (film: the act's `[data-act-layer]`; still: the figure's `[data-still-layer]`), `slot`, `model`, `data` (the
graph JSON), `payload` (from `acts/payload.ts`, computed on the server), `framing`, `size()`, `screenOf(v, out)`,
`screenOfWorld(x, y, z, out)`, `obstacles()`, `label({ active, micro })` (the film's own labels: `set(path, note)`,
`at(v)`, `atWorld(x, y, z)`, `hide()`), `traced()`, `pinnedFile()`, `pin(v)` (the act announces it through its own
readout; the film announces pins made on the drawing), `onPin(listener)`, `retrace()`, `reveal(t)` (brings the film to
the act's local t at once: focus reveal) and `invalidate()`.

Act modules never import three.js, GSAP or `stage.ts`: what they need comes through the context, so the still layout
runs every act without downloading either.

For an act's builder:

- The camera: `standingOf(model, framing, v)` gives a file's place in the standing structure (world space);
  `cameraFrom(values, out)` turns a key's values into a camera (the still figure's `camera()` can use it).
  `holdKeys(from)` holds the previous act's last shot.
- Labels step aside while a file is traced (`ctx.traced() >= 0`), as Act I's do; otherwise the traced file can carry
  two labels. Words over the frame carry `data-obstacle` so labels keep clear of them.
- A block pinned over the frame from outside it (the landing's, `.slotPinned`) paints over every layer of the frame:
  the pinned stage is its own stacking context. On tall framings it keeps the band `--k-foot` at the frame's foot
  free for the title block, as the captions do.
- In the still layout an act's figure is a `<StillFigure act="...">` placed in its block; it is drawn when it comes
  within a viewport of the window (at most two figures hold pixels) and its overlay is updated with `still.t`, and
  again after every trace.
- The plan's z-index scale (`base.css`): the frame's layers are `--z-film-drawing` 0 to `--z-film-words` 4.

## The page around the film (DOM contract)

- `html[data-kfilm="film" | "still"]` (the mode script, before first paint), `html[data-kfilm-under]` (the frame
  lies under the navigation: a clear bar), `html[data-kfilm-ready]` (the film's code runs), `html[data-kfilm-live]`
  (the drawing has drawn). Set by the film only; `data-js` is the layout's.
- Anchors `#film-start`, `#evidence`, `#impact`, `#trace`: empty marks. In the film they sit at their acts' anchors on
  the track and cancel the page's 5rem scroll padding (the window stops exactly on the beat, under a clear bar); in
  the still layout they precede their acts' blocks.
- `[data-act-slot]`: each act's block, in reading order after the frame. In the film the slots of Acts I to III sit
  at their anchors on the track (Act I's narration is visually hidden there; an act's block hides its own words); the
  landing's is pinned over the frame for its whole act (`pointer-events: none` where it draws nothing). In the still
  layout the slots are the article. A slot carries `data-active` while its act is on screen.
- `[data-act-layer]`: each act's words over the drawing, film only, `data-active` while on screen.
- `[data-caption][data-act][data-from][data-to]`: shown (`data-on`) while its act's local t is in [from, to], in any
  act's layer.
- `[data-obstacle]` (with `data-on` when shown, or `="always"`; `data-obstacle-pad`, `[data-obstacle-box]` for the
  measured parts): words labels keep clear of.
- `a[data-film-skip]` anywhere on the page: "Skip the film", an instant jump.
- `sessionStorage["kfilm-under:<path>"]`: the film's note of whether its frame lies under the bar, kept current with
  `data-kfilm-under`. On a reload, back or forward the mode script reads it, so the bar has the right ground from the
  first frame at the restored position (without the note it decides on the first animation frame).
- `--k-foot` (on the film): on tall framings, the band at the frame's foot the title block holds.
- Performance marks: `kfilm:start`, `kfilm:model`, `kfilm:stage-ready`, `kfilm:first-frame` (both paths),
  `kfilm:act-<id>`. `window.__kfilm` is the director or the still controller outside production.

## Act I, beat by beat (local t)

| Beat        | t              | What happens                                                                                                          | Words on screen                                                                                                                        |
| ----------- | -------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Hero        | 0 to 0.034     | The plan on its board, the first level already hanging; labels on the two heaviest foundations                        | "See what your code stands on.", lede, Explore Katedrala, View on GitHub                                                               |
| Plan        | 0.04 to 0.07   | The camera comes down past the edge of the board; up to 8 of the plan's directories named on the rim (wide windows)   | "91 foundations, set out on a plan." (0.052 to 0.118)                                                                                  |
| Drop        | 0.07 to 0.27   | Levels 2 to 15 are released: each weight falls, its chains catch it with one rebound, it swings in under its supports | "Every other file hangs from the files it depends on.", "1,369 runtime dependencies pull taut."                                        |
| Hang        | 0.27 to 0.40   | The whole model breathes; the camera leans in                                                                         | "Gravity finds the form."                                                                                                              |
| Circle      | 0.40 to 0.555  | The camera circles to stand side-on; the crown is labelled                                                            | "The lowest weight is src/app/page.tsx."                                                                                               |
| Freeze      | 0.555 to 0.59  | The sway dies out; crop marks close round the model like a photograph                                                 | none                                                                                                                                   |
| Turn        | 0.59 to 0.69   | The model turns over in the picture plane; every member flashes load blue at mid-turn; "stands." turns with it        | "Turn it over and it stands."                                                                                                          |
| Load        | 0.69 to 0.745  | A wave of load blue runs from the crown down to the foundations                                                       | "Load runs down to the foundations."                                                                                                   |
| Zoom, climb | 0.745 to 0.895 | A dolly into the base, then a crane shot up the longest load path; the gauge counts +00 to +15                        | "16 levels from the ground to the crown."                                                                                              |
| Crown hold  | 0.895 to 1     | The camera lands on the crown with everything it stands on lit, and holds                                             | "The crown of CodeVerse, 15 levels up." / "It depends directly on 1 file, and through it stands on 137 files, 40 of them foundations." |

The opening runs on time from the stage's first frame: a pen draws the plan in 0.9 s, each foundation lands 50 ms
behind it, the first level is let go at 1.25 s; the headline's words drop with a damped spring, the lede and the
actions follow. "Explore Katedrala" goes to `#film-start` (the plan caption): a short smooth scroll in the film, an
instant jump in the still layout. The four files to trace, at the end of the prototype, are the landing's.

## Motion, rendering, fallbacks

As in the prototype: one authored sequence, scrubbed by the visitor; a camera with a little mass (140 ms, snapping on
jumps over 1.3 viewports); monotone cubic camera tracks; a quintic turn; captions cut, never overlap; the word-drop
spring overshoots once, on purpose; exits faster than entrances; buttons press to 0.97. The stage draws only when
something changes and stops off screen, in a hidden tab and at rest; the pixel ratio is capped at 2 and steps down
when the median of 90 frames exceeds 21 ms.

Still layout (reduced motion, no usable WebGL 2, a stage or GSAP that cannot load): the hero frame shows the standing
structure in 2D with the crown named, Act I's narration is the article under it, and each act's block shows its own
figure. "Drawn without WebGL" is added to the title block only when WebGL is the reason. Without JavaScript the words
are all there and no empty canvas shows.

## Drawing the structure elsewhere (the key plan)

`fallback.ts` draws the standing structure in Canvas 2D anywhere, without three.js or GSAP:

1. On the server, `codeverse()` (`codeverse.ts`, server only) gives the model; pass `restOf(model)` (1,212 numbers,
   about 7 KB of JSON) to the client island. Building the model with them takes about 5 ms; without them the layout
   runs in the browser (about 110 ms in Node on the cloud session's CPU).
2. In the browser, fetch `DATA_URL` (the page preloads it; the HTTP cache serves it again) and `buildModel(data, rest)`.
3. `new Fallback(canvas, model, framing)`, with the window's framing (`matchMedia(TALL_MEDIA)`), so the structure is
   turned over the way the film turned it on that screen.
4. `resize(width, height, dpr, framing)` with the pixel ratio capped at 2, `setCamera(planCamera(model))`, then
   `draw(null)` (or `draw(mask)` with a `LitMask`). `release()` gives the pixels back.

`planCamera` sees the standing structure steeply from above, the plan's long axis across about 70 percent of a 16:10
frame; narrower frames keep that width.

## Honest labels

- From Katedrala's document of CodeVerse (`tedddby/CodeVerse` at `6b942bc`, katedrala 0.1.0, IR schema 1.0.0): the
  404 source files, their lines, the 1,369 runtime dependencies between them (183 test files left out), and the
  directories they sit in.
- Computed for this page from those relationships (`scripts/build-codeverse-graph.mjs`, `model.ts`): levels, reach,
  the 91 foundations, the crown, the 31 files nothing depends on, the longest load path.
- Drawn: positions, line weights, the motion. The legend and the narration say so. Directories are the boundaries
  Katedrala records today; modules are planned for v1 (the narration says it at the plan beat).
- The title block carries the status: "Dependency graph, available today". Nothing in Act I is planned work.

## Measurements

On the user's Windows machine before the cloud handoff (2026-10-09): headless Microsoft Edge, Intel UHD Graphics
through ANGLE D3D11, requestAnimationFrame at about 144 Hz, against the Next dev server, while other work ran on the
machine: indicative.

Act I scrubbed in 14 s on the preview route (the same scroll as the prototype's whole film):

| Window                                | rAF median | rAF p95       | rAF max         | Frames over 20 ms | Tick median   | Tick p95      | Long tasks |
| ------------------------------------- | ---------- | ------------- | --------------- | ----------------- | ------------- | ------------- | ---------- |
| 1440 x 900                            | 6.9 ms     | 7.0 ms        | 27.8 ms         | 1 of 2,095        | 0.3 ms        | 0.7 ms        | 0          |
| 390 x 844, DPR 3 (stage at 2)         | 6.9 ms     | 7.0 ms        | 27.8 ms         | 1 of 2,099        | 0.3 ms        | 0.6 ms        | 0          |
| 1440 x 900, 4x CPU throttle           | 7.0 ms     | 14 ms         | 27.8 ms         | 34 of 1,621       | 1.4 ms        | 3.2 ms        | 0          |
| 390 x 844, 4x CPU throttle (two runs) | 7.0 ms     | 13.9 to 14 ms | 34.8 to 41.7 ms | 24 to 35          | 1.2 to 1.3 ms | 2.6 to 2.9 ms | 0          |

A first throttled phone run, taken while the dev server was compiling for other work, was far slower (37 long
tasks); the two runs after it are the table's.

Marks on load (1440 x 900, dev server): film `kfilm:start` 560 ms, `kfilm:stage-ready` 632 ms, `kfilm:first-frame`
764 ms; reduced motion (2D) first frame 512 ms; WebGL disabled (2D) 580 ms. Neither still mode requests three.js or
GSAP. Idle: 0 frames over 2 s at the hero after its opening, at the crown hold, in a held act and at the end of the
film; 0 rAF callbacks with the film off screen. The hanging model breathes (and draws) while it hangs free, and calms
14 s after the last input, as before.

In the cloud session (2026-10-09, Linux, no GPU: WebGL through SwiftShader, Edge headless, dev server) appearance and
behaviour were checked again; GPU-bound figures from there are not real ones. Act I scrubbed in 14 s at 1440 x 900
drew at a median of 117 ms per frame (software rendering) while the film's own work per tick stayed at a median of
1.1 ms (p95 5.9 ms). Marks on load, median of five: film `kfilm:first-frame` 1,429 ms after navigation (first
contentful paint 532 ms); reduced motion 1,090 ms; WebGL disabled 1,432 ms; the dev server's hydration of the whole
route dominates them. The frame budgets of the plan are to be measured again on a machine with a GPU.

Full-page captures that render beyond the viewport (Chromium's `captureBeyondViewport`, used by Playwright's
`fullPage`) lay the page out in a window as tall as the page, which can turn the film to its tall framing
mid-capture; there (under SwiftShader) some of them also lost the hero's headline, which the page itself never did.
Stitch full-page captures by scrolling the window, and look at every one.

## Known weaknesses

- GSAP ScrollTrigger keeps an empty requestAnimationFrame loop alive while it is registered (its repaint workaround).
- Every number above is from one machine against the dev server; real phones, Safari and Firefox are unmeasured.
- A browser with the WebGL 2 API but no usable context switches to the still layout on mount, after hydration.
- The film creates two WebGL contexts at start (the probe, released at once, and the renderer's): one is alive at a
  time.
- The word-drop spring is a deliberate overshoot that Impeccable's detector reports as bounce easing.
- On wider-than-16:10 windows the camera's orbit carries the lowest weight under the narration for part of its beat;
  its label waits for the file to come out.
- In the still layout a figure draws only within a viewport of the window, so `data-kfilm-live` and
  `kfilm:first-frame` wait for the hero when a deep link lands far below it.
- Until the acts are built, Acts II, III and the landing hold the crown's shot with nothing lit (their stubs).
