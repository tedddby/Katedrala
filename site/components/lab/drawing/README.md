# Lab: the hanging model (`/lab/drawing/`)

A prototype hero for the landing page: Gaudí's hanging-chain experiment, performed on Katedrala's real analysis
of CodeVerse and drawn as a structural drawing that turns over about its own ground line.

## The idea, in five lines

1. Gaudí found the vaults of the Colònia Güell church upside down: chains hung from a plan, weighted in
   proportion to the loads, take their funicular form in pure tension; turned over, they stand in pure compression.
2. Here the plan is CodeVerse (commit `6b942bc`): its 91 foundations, the source files that depend on no other
   source file, are pinned to a board laid out as one bay per top-level directory, as wide as its code.
3. The other 312 source files are the weights, each as heavy as its lines of code, hung on the 1,369 runtime
   dependencies between source files (a file hangs from the files it depends on). Line weight is the load a chain carries.
4. Gravity finds the form while the page loads. Scrolling turns the drawing over about the board line, through the
   plan, until the architecture stands 16 levels high on hatched ground, `src/app/page.tsx` at the crown.
5. Hover, tap or select any file with the keyboard and its load path lights in load blue: everything resting on
   it, rising to the crown, and what it rests on, down to the ground.

## Physics and rendering

**The form is exact, the motion is physical.** `model.ts` computes the hanging form by the force density method
(Schek, 1974) with fixed heights: a file hangs at minus its level (the analysis' longest runtime path down to a
foundation), and with heights fixed horizontal equilibrium is linear, solved by over-relaxation. Each chain's force
density is the load it carries vertically over the levels it spans. The load flow is the drawing's own rule:
every file passes its lines of code, plus everything it received, to the files it depends on in equal shares
(cycles are condensed and pass their combined load out). Foundations and directory strips are ordered by a few
rounds of barycentric ordering, keeping the round with the least load-weighted chain span.

`engine/sim.ts` gets the weights there: released level by level just under their supports, they fall on chains
that pull but never push (Verlet integration, one-sided distance constraints, 120 Hz fixed steps), swing, and a
spring onto the exact form ramps in after each release, so the drawing always lands on the solved equilibrium.

Every chain is drawn as a true catenary between its two ends (`engine/catenary.ts`): its length is the taut length
or, if longer, the length it sags to under its own weight at its horizontal tension, so lightly loaded chains hang
in loops and heavy ones pull straight. The catenary is solved per chain on the CPU (Newton's method, warm-started
from the previous frame, and skipped when neither end moved nor its load changed) and sampled by arc length in the
vertex shader.

`engine/gl.ts` renders with three.js: two raw shader materials over instanced buffers. One instance per chain is a
24-segment ribbon offset across the line in screen space, so its width is exact in CSS pixels at any scale; width
is proportional to the square root of the load (0.16 to 4.2 px; sub-pixel lines keep a one-pixel ribbon and fade,
like a 0.13 mm pen on drafting film). One instance per file is a disc (a weight) or a ring with a sheet-coloured
face (a pin). The projection is orthographic; the turn-over touches no instance data, it is two uniforms (the
cosine and sine of the angle about the board line), and the framing moves from the hanging frame through the plan
frame to the standing frame by cos² and sin² weights, so the board line travels down the sheet as it turns. Lines
farther away in the current view are drawn up to half as strong (the "beyond" line weight of a drawing).

Annotations are SVG over the canvas (`engine/overlay.ts`), projected with the same camera: the level datum, the
plan's dimension chain (bay names and lines of code), the hatched ground, and callouts with leader lines placed by
scoring candidate positions against the title block and the edge of the drawing.

The scroll is read with GSAP ScrollTrigger as the progress through a `position: sticky` stage (no pin spacer, no
scroll hijack: the page scrolls natively and the drawing eases toward the scroll in 0.11 s). The loop only runs
while something moves and stops when the section is off screen.

## What the reader sees

Shares are of the pinned scroll (420 svh on desktop, 440 svh on phones).

| Scroll                       | Drawing                                                                                                                                                                                                                                                                                                                                                             | Text                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| First paint                  | The board line and its 92 pins, drawn on the server (SVG), where the model will hang.                                                                                                                                                                                                                                                                               | Headline, lede, Get started, View on GitHub.                    |
| 0 (time-driven, about 4.6 s) | The hang: level by level the files drop on their chains and swing into the form; reaction bars above the board grow with the load each foundation carries; the title block counts "Hanging N of 404 files"; a callout names `src/graph/model/types.ts`, 147 source files rest on it.                                                                                | Hero copy.                                                      |
| 0.15                         | Elevation, hanging.                                                                                                                                                                                                                                                                                                                                                 | "Hung from its foundations." with 312 weights and 1,369 chains. |
| 0.20 to 0.35                 | The first quarter turn about the board line, drawn as a centre line in load blue while it turns.                                                                                                                                                                                                                                                                    | "Turn it over."                                                 |
| 0.35 to 0.45                 | The plan of the board: 14 bays with names and lines of code above, chains quieter (they hang beyond the board).                                                                                                                                                                                                                                                     | "The plan." 14 directories, 51,021 lines.                       |
| 0.45 to 0.60                 | The second quarter turn; the board becomes the ground line and the hatched ground draws in.                                                                                                                                                                                                                                                                         |                                                                 |
| 0.60 to 0.75                 | Elevation, standing: level datum 0 to 15, `src/app/page.tsx` called out at level 15.                                                                                                                                                                                                                                                                                | "The architecture stands." 137 files beneath the crown.         |
| 0.75 to 0.92                 | The scroll's own test: the load path of `src/graph/model/types.ts` lights in load blue, rising with the scroll from the ground to the crown.                                                                                                                                                                                                                        | "Test any member."                                              |
| Any time                     | Hover (mouse), tap (touch) or the keyboard selects a file: what rests on it lights in load blue from the file up, what it rests on is drawn heavier, everything else dims; a callout gives its path, level, how many files it rests on and how many it carries. A fast mouse sweep through the hanging model brushes the weights and they swing back into the form. |                                                                 |

**Phones (below 900 px)** are composed differently, not shrunk: the drawing owns a band across the top 57% of
the sheet and the text scrolls up beneath it, like notes under a drawing, so nothing ever covers the structure.
The band uses a squarer board (14.5 levels wide instead of 22) so the model fills it, the title block becomes a
strip along the band's lower edge, and callouts are a size smaller.

**Keyboard:** the drawing is one tab stop after the hero actions. Focus selects the heaviest foundation; arrows
up and down move between levels (up is up in the current view), left and right walk all files in level order,
Home selects the heaviest foundation, End the highest file, Escape clears. Each selection is announced.

## Honest labels

- The title block says what the drawing is: "Katedrala's real analysis of CodeVerse", `tedddby/CodeVerse at
6b942bc`. It is real output, not a demonstration.
- Every number on the page is computed from `public/data/codeverse-graph.json` (written by
  `scripts/build-codeverse-graph.mjs` from Katedrala's document of CodeVerse): on the server at build time
  (`facts.ts`) and in the browser from the same file. None is typed by hand.
- What is drawn is named precisely: source files only (the 183 test files and type-only dependencies are left
  out, they carry nothing at runtime); foundations are files that depend on no other source file; a level is the
  longest runtime path down to a foundation; "rest on" counts files depending on a file directly or through others.
- Two things are the drawing's rules, not Katedrala metrics, and the code says so where it applies them: the
  load flow behind line weight (equal shares of lines of code) and the plan layout (bays by lines of code,
  barycentric ordering). Nothing claims Architectural Gravity or any planned metric.
- No church imagery: chains, weights, a board, a datum, hatching. Structure and geometry only.

## Fallbacks

- **Reduced motion:** decided by CSS before the first paint. The section is not pinned for a sequence; the
  standing structure is drawn still from the start (no hang, no sway, no turn, no camera movement), the still
  notes follow the hero in the text column, and testing a member still works (the load path appears at once,
  with a 160 ms fade).
- **No WebGL 2:** `engine/canvas2d.ts` strokes the same records with the 2D canvas, once: a still drawing of the
  standing structure computed from the data, redrawn only when a member is tested. The still layout is switched
  in before the engine loads, while the reader is on the first viewport.
- **Engine or data failure:** the still layout, the server-drawn board and the text alternative remain.
- **Text alternative:** inside the figure (`sr-only`): counts, files per level, the crown and what it rests on,
  the five heaviest foundations, and keyboard help; a live region announces each selected member.
- **Without JavaScript:** the hero copy, captions, title block, board and text alternative are server-rendered.

## Files

| File                                                     | Role                                                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `app/lab/drawing/page.tsx`                               | The route: the hero at the top of a page.                                                                     |
| `HangingHero.tsx`                                        | Server: copy, captions, title block, text alternative, the server-drawn board.                                |
| `HangingModel.tsx`                                       | Client shell: owns the canvas, loads the data and the engine after paint (three.js only where WebGL 2 works). |
| `facts.ts`, `model.ts`                                   | The analysis, load flow and hanging form, shared by server and browser.                                       |
| `engine/stage.ts`                                        | Choreography, input, records, annotations, title block.                                                       |
| `engine/sim.ts`, `engine/catenary.ts`, `engine/view.ts`  | The hang, the catenary, the projection.                                                                       |
| `engine/gl.ts`, `engine/canvas2d.ts`, `engine/layers.ts` | WebGL renderer, still fallback, the record formats they share.                                                |
| `engine/overlay.ts`                                      | Datum, dimension chain, hatched ground, callouts.                                                             |
| `hanging.module.css`                                     | The composition per breakpoint (the camera frames live here) and the still layout.                            |

## Measured

MEASUREMENTS
