# Katedrala: promoting the cinematic film to the main page

Director's plan, resumed and completed on 2026-10-08. Review only: no repository file was edited. Scripts written
for this revision live in scratchpad/lab/director2/ and scratchpad/shots/director2/.

## What this revision re-checked, and what it corrects in the draft

Re-read for this revision: the 64 KB draft; every file of the prototype (site/components/lab/cinematic/*, including
the new film-global.css, and site/app/lab/cinematic/page.tsx), which the finisher was still editing while this was
written (last seen 2026-10-08 00:46); the iter14 and review0 captures; site/app/page.tsx and every component it renders
after the fix pass; the refreshed captures in site/.impeccable/review/ (site rebuilt and recaptured 2026-10-08
00:26); review-paired.md and review-summary.txt; finish-review-1.md; the direction contract; site/PRODUCT.md and
site/README.md; the landing-fixes workflow (decisions D1 to D9, its file ownership); the two workflows running now
(cinematic finish, M5 build); the three skills (Taste SKILL with dials 9/9/3, Emil SKILL, Impeccable SKILL,
craft, craft-floor, mode-persuade, new-work sections 6 and 7, visualize's depth rule); docs/ROADMAP.md and
docs/ARCHITECTURE.md; the CodeVerse document (%TEMP%/codeverse-structure-2.json) and
public/data/codeverse-graph.json. Every number in this plan was recomputed by script from those two files
(appendix A). The dev server at http://localhost:3100 serves both routes.

Corrections and completions against the draft:

1. The fix pass is complete: fixes, integration build and recapture (site/out and .impeccable/review rebuilt at
   2026-10-08 00:26; the page measures 15,158 px at 1440, 21,054 px at 390). Gate G0 is met: B3, B4 and B5 no longer
   wait. The baseline must still be captured before the first promotion edit (gate GB).
2. A finisher is polishing the prototype in parallel with this plan. Its final state
   (site/components/lab/cinematic/README.md and scratchpad/lab/cinematic/final/) supersedes iter14 as the parity
   reference and as the code B1 moves. Nothing below hard-codes iter14 beat values; where the finisher's final
   copy or beats differ from this plan's Act I list, the finisher wins if the honesty audit passes it.
3. The prototype now carries pieces the draft re-invented: html[data-kfilm-under] kept current by the director
   with film-global.css styling the site navigation over the film, a 12 s still fallback in the mode script, and a
   WebGL 2 probe with failIfMajorPerformanceCaveat. All are kept; the navigation rules move into nav.css.
4. Ownership follows the files the fix pass added and removed: ui/TermBar.tsx is gone and ui/TermLedger.tsx is new
   (Gravity and Entropy), site/MenuDisclosure.tsx is new, lib/demo/plan.ts (explorer), scripts/check-links.mjs
   (the launch gate) and scripts/serve.mjs exist.
5. Act I's track is 760vh at 1440 and 680vh on phones today: 6.6 and 5.8 viewports of pinned scroll, not 6.0 and
   5.6. Lengths below are budgets on top of whatever the finisher leaves.
6. Copy: the phrase "as Katedrala's analysis gives it" no longer exists, and the finisher has just replaced "entry
   point" (claims/C12: entryPoints is an IR term; the document lists 4); the graphite "+" was still owed at 00:46.
   Act II's "binds each reference" overclaimed exactly as copy/C16 did and is reworded; E1 and E5 no longer equate
   drawn lines with relationship records; Act III's "10 directories" was the build script's groups (9 folders under
   src/ plus the one file at its root) and leaves the caption.
7. JS numbers come from what the static export actually fetches (site/out as built at 00:26, served locally,
   network log per mode, appendix B), not from the esbuild bundle: three.js 132.7 KB gzip plus the stage chunk 13.3,
   gsap 27.5 plus ScrollTrigger 17.5, director 11.9, film island 1.2, graph data 17.2; the main page fetches 159.4 KB
   of JS on load. That build showed two defects: under reduced motion the prototype downloaded three.js (its still
   frame was drawn by WebGL), and with WebGL disabled it downloaded three.js and GSAP anyway. The finisher's edits
   up to 00:46 already moved the reduced-motion still to Canvas 2D, mark kfilm:first-frame on the 2D path and fix
   "entry point"; FilmClient still prefetched three.js and GSAP whenever the mode script said "film", before the
   WebGL probe, so a browser with the API but no usable context still pays for them. B1 checks every item of this
   plan against the finisher's final state and skips what is already done.
8. Testing: headless Edge with default arguments renders WebGL on this machine's Intel UHD through ANGLE D3D11 (real
   frame times, first context 33 to 220 ms). SwiftShader also passes the caveat probe but its first context blocks
   the main thread for about 1.1 s. Use default arguments; SwiftShader only on a machine without a GPU.
9. DESIGN.md and .impeccable/design.json are written by Impeccable's documenter after the last correction, not by a
   builder. The finish review follows Impeccable's procedure exactly (fresh impeccable-finish-reviewer, four
   dispositions, at most two rounds).
10. History moves from B4 to B5 to balance the work, and stops borrowing entropy.css classes.
11. The final call to action loses the draft's optional plan bookend (the key plan in Ecosystem is the one callback
    to the film), and gauge-scale numerals are limited to Gravity, Entropy and Act III (Impeccable refuses the
    hero-metric template; Taste refuses repeated devices).
12. New in this revision: the brief coverage matrix (1.5); the Act II rulers built from real symbol ranges; the act
    interface (3.3) and the builder contracts (3.5); the M5 reconciliation gate (milestone 5 may flip to Done while
    this is built, by another workflow that writes scratchpad/m5-site-followups.md); the integration step before the
    reviews; the capture specification the finish reviewer needs for a pinned film.

---

## 0. The decision

The film becomes the spine of the page and its one authored moment (Impeccable's depth rule: one dominant move, the
rest holds still in the same material). It runs as one continuous pinned sequence on Katedrala's real analysis of
CodeVerse, in three acts and a landing:

- Act I is the prototype as the finisher leaves it: the plan, the hang, gravity finds the form, the turn, the load
  wave, the climb, then a crown hold instead of the end card.
- Act II dives into one real dependency and performs Parse and Link on it, down to its lines of code, ending on the
  real relationship record: "Every conclusion has evidence."
- Act III sends a change up from src/graph/model/types.ts through everything that rests on it: "Know what a change
  will touch before you make it." Impact analysis stays marked Planned for v1; the trace is computed by the page over
  Katedrala's dependencies and says so beside its numbers.
- The landing lets anyone trace any of the 404 files, in both directions, with the drawing's legend.

Everything inside the film is real. A hinge plate (the five passes drawn as a hanging chain: two links built, three
in construction) turns the page from Katedrala's real output to the demonstration system, where the planned
capabilities are previewed in plates that speak the film's drawing language without repeating its spectacle. The old
Hero, Impact and Evidence sections and the lab's ReadingNotes stop being separate sections; their requirements move
into the film.

Design read (Taste 0.B): "Reading this as: an open-source developer-infrastructure landing page for TypeScript and
JavaScript developers and tool builders, with an Awwwards-experimental structural-drawing language, leaning toward a
scroll-scrubbed WebGL film (three.js, GSAP ScrollTrigger) over server-rendered Next.js plates."
Dials: DESIGN_VARIANCE 9, MOTION_INTENSITY 9, VISUAL_DENSITY 3. Motion 9 is spent on the film (camera, physics, the
turn, waves, kinetic captions) and on state changes inside plates (dependencies that drop in and pull taut, load
that arrives), never on scroll-triggered entrances in plates (craft floor: one authored moment, not one identical
entrance on every section; brief: no generic scroll animations; Emil: never animate keyboard-initiated actions).

Skill conflicts, resolved for the brief and the committed world (Impeccable: the brief wins):
- Taste's default motion library (motion/react): not used. GSAP and three.js are already dependencies; no
  dependency is added.
- Taste's "real images first" and "no hand-rolled SVG": the page's visuals are drawings of real output and of the
  labelled demonstration system (the brief bans stock illustration and screenshots); marks drawn in one stroke stay
  (Impeccable allows authored SVG icons; the drawings are charts drawn from data, not illustrations).
- Taste's dual light and dark: the world is one dark sheet chosen from the use scene (Impeccable) and locked by the
  user's choice of Load Path; color-scheme dark; no section inverts (Taste's theme lock).
- Section numbers only where the sequence carries information: passes 01 to 05, milestones 01 to 15 (they match
  docs/ROADMAP.md, so "milestone 14" stays findable).

Decisions D1 to D9 of the landing-fixes workflow carry over unchanged: the status vocabulary ("Available today",
"Planned for v1", "Planned after v1", present tense only for what is available today); roadmap states mirroring
docs/ROADMAP.md; no "developed in public" or "built in public"; vocabulary (members, modules; never call a demo member a
component; American spelling; thousands separators; two-decimal scores); ledes at most two lines at 1440; no em dash
and no en dash used as a dash; the Load Path palette and the floor bans; computed or real numbers only; phone
readability (SVG text at least 11 CSS px, 44 px primary targets); the accessibility patterns (2 px load-blue focus
rings, APG widgets, short atomic live regions, forced colors).

---

## 1. The new page narrative

### 1.1 Sequence, first viewport to footer

Lengths are document height in viewports (vh / 100) at 1440x900 and 390x844. For film acts the figure is pinned
scroll; the film adds one frame height once.

| # | Scene or plate | Anchor | Subject and data | Status marks | 1440 | 390 |
|---|---|---|---|---|---|---|
| 0 | Skip links, then the navbar (clear over the film, solid after it) | | | | | |
| 1 | Film, Act I: "See what your code stands on." (hero frame, plan, hang, turn, load, climb, crown hold) | #top, #film-start | Real: public/data/codeverse-graph.json | Title block: "Dependency graph, available today" | 6.6 | 5.8 |
| 2 | Film, Act II: "Every conclusion has evidence." | #evidence | Real: one dependency, its 3 relationships and 7 observations, symbol ranges, REAL_EDGE | Available today (Parse, Link, provenance) | <= 2.0 | <= 1.9 |
| 3 | Film, Act III: "Know what a change will touch before you make it." | #impact | Real: reachability from src/graph/model/types.ts, computed by the page | Planned for v1 (impact analysis) | <= 1.8 | <= 1.8 |
| 4 | Film landing: "Trace any file." (pin holds, then releases) | #trace | Real: any of the 404 files, both directions | Title block | <= 0.8 | <= 0.8 |
| | Film frame (counted once) | | | | 1.0 | 1.0 |
| 5 | Hinge plate: "From source code to architecture." (five passes) | #how-it-works | Parse and Link real; Infer, Analyze, Explain on the demonstration system | 2 x Available today, 3 x Planned for v1 | 1.1 | 2.0 |
| 6 | Plate: "The whole structure, at every scale." (explorer) | #architecture | Demonstration system | Typed graph, available today; Module inference, planned for v1 | 1.4 | 1.3 |
| 7 | Plate: "Some members hold up more of the system than others." (Gravity, absorbs the score half of Explain) | #gravity | Demonstration system | Katedrala heuristic, planned for v1 | 1.6 | 2.6 |
| 8 | Plate: "Structure decays one dependency at a time." (Entropy) | #entropy | Demonstration system | Katedrala heuristic, planned for v1 | 1.6 | 2.3 |
| 9 | Plate: "See the structure drift across commits." (History, contact strip) | #history | Demonstration system | Planned for v1 | 1.1 | 1.0 |
| 10 | Plate: "Write down the architecture you intend." (Rules) | #rules | Demonstration system plus one hypothetical import | Planned for v1 | 1.3 | 2.1 |
| 11 | Plate: "One command per question." (Developers) | #developers | Real analyze counts; computed demo transcripts; the library, real | CLI planned for v1; library available; guarantees mixed | 1.6 | 2.3 |
| 12 | Plate: "Read every line of it." (Open source) | #open-source | Real: MIT, MILESTONES | Milestone states | 1.3 | 2.0 |
| 13 | Plate: "Built to carry other tools." (Ecosystem and CodeVerse) | #ecosystem | Real counts; statuses | Mixed; CodeVerse adapter Planned for v1 (milestone 14) | 1.4 | 2.6 |
| 14 | Final call to action: "Understand your system before you change it." | #get-started | | | 0.7 | 0.6 |
| 15 | Footer | | | | 0.3 | 0.7 |

Totals: about 25.6 viewports at 1440 (film 12.2, plates 13.4) against 16.8 today; about 30.8 at 390 (film 11.3,
plates 19.5) against 24.9 today. Every beat must change something on screen; the navigation and the "Skip the film"
link are the fast routes past the film for those who want them.

### 1.2 What happens to each current section

| Current section | Fate | Brief requirement, and where it is met now |
|---|---|---|
| Hero (Hero, HeroDrawing, MemberCard and the demo LoadDrawing in it) | Removed; replaced by the film's hero frame | THE HERO, HERO VISUAL, MAKE THE VISUALIZATION INTERACTIVE: real structure reconstructed in front of the visitor; hovering or tapping a file lights its load path, steps the rest back and names it |
| Lab ReadingNotes ("How to read the drawing") | Merged into the landing's legend and its disclosure | Honesty: drawing conventions versus Katedrala output |
| Lab LabNav | Removed; the site navbar replaces it | NAVIGATION |
| Pipeline (five passes) | Stays as the hinge plate, recomposed as a hanging chain; Parse and Link are also performed on real data in Act II | FROM CODE TO ARCHITECTURE |
| Architecture (explorer) | Stays as a plate | THE ARCHITECTURE GRAPH (relationship kinds, modules, boundaries, hover, click, focus, zoom, pan) |
| Gravity | Stays; absorbs Evidence's "Why does ... score ...?" reasons, each tied to what it measured in the drawing | ARCHITECTURAL GRAVITY and the score half of EXPLAINABILITY |
| Entropy | Stays | ARCHITECTURAL ENTROPY |
| Impact | Removed; becomes Act III (real data, honestly scoped) and the landing's "What rests on it" | CHANGE IMPACT, including "feel like querying the system" |
| Rules | Stays; gains an add/remove toggle for the hypothetical import | ARCHITECTURAL RULES |
| Evidence | Split: the real relationship moves into Act II; the reasons move into Gravity | EXPLAINABILITY ("Every conclusion has evidence." becomes Act II's title) |
| History | Stays as a contact strip | ARCHITECTURE OVER TIME |
| Developers | Stays | BUILT FOR DEVELOPERS |
| Open source | Stays; the roadmap becomes a construction gauge | OPEN SOURCE |
| Ecosystem | Stays; gains the key plan of CodeVerse's own source, a callback to the film | BUILT TO POWER OTHER TOOLS and CODEVERSE CONNECTION |
| Final CTA | Stays, dramatically simpler than the hero | FINAL CTA |
| Navbar, Footer | Stay (the navbar becomes film-aware) | NAVIGATION |

### 1.3 Why the split falls where it does

- Five passes: Parse and Link run today, so the film performs them on one real dependency (Act II). Infer, Analyze
  and Explain have nothing real to show on CodeVerse yet; staging them inside the real-data film would blur the one
  line the page must keep sharp. The hinge plate is where the page crosses that line, and its own drawing says so:
  solid links built, dashed links in construction.
- Gravity and load: the film's line weight is a drawing convention and its reach ("carries 147 files") is real;
  Architectural Gravity is a planned heuristic and stays on the demonstration system. The plate borrows the film's
  devices (gauge numerals for the score, load arriving level by level, leader labels) without computing a draft
  heuristic on real code.
- Impact as load travelling: Act III is the load wave reversed, on real data. Its counts are reachability computed by
  the page over Katedrala's dependency graph (milestone 4's reachability exists in the engine, but impact analysis,
  milestone 9, does not); the act title's Planned for v1 mark and a scope line beside the numbers keep that honest.
- The evidence behind one real relationship: Act II, the film's macro lens, down to line numbers.

### 1.4 The film, beat by beat

One ScrollTrigger over one track; the director maps global progress p to (act, local t). Camera keys are
continuous across act boundaries (no cuts, except the camera's existing snap on long anchor jumps). Every number is
computed at build time from public/data/codeverse-graph.json, the new public/data/codeverse-evidence.json or
lib/site.ts; none may be typed by hand. All counts below were recomputed from the document (appendix A).

One text, two presentations. Each act has one semantic block in the DOM (its h2, its narration as full sentences,
its record, its controls). In film mode the block is visually hidden but keeps its position (it is absolutely
placed at its act's offset in the track, so #evidence, #impact and #trace land on their beats) and the visible
words are the word-split captions, which are aria-hidden. In still mode and without JavaScript the same blocks are
the visible article. Screen readers therefore read: h1, lede, actions, the Act I narration, then h2 "Every
conclusion has evidence.", h2 "Know what a change will touch before you make it.", h2 "Trace any file." with their
contents, in order, once.

#### Act I: "See what your code stands on." (the finisher's final version, kept)

Keep the finisher's beats, camera keys, physics, captions, annotations, crop marks, the turning word and the gauge.
Changes only:

1. Hero frame. The h1 stays "See what your code stands on." The lede is the main page's reviewed hero lede,
   "Katedrala reconstructs the architecture of TypeScript and JavaScript, with evidence for every dependency it
   finds." (with its non-breaking spaces, copy/C20; 16 words, within Taste's 20). Actions through ui/Button:
   "Explore Katedrala" (primary) to #film-start, the first caption, so the primary action plays the film instead of
   skipping it (a short smooth scroll in film mode, an instant jump otherwise); "View on GitHub" (secondary) to
   LINKS.repository. "Get started" stays in the navbar and the final CTA: one label per intent (Taste). The hero copy,
   captions, gauge and title block align to the page frame (max 82.5rem plus gutters) instead of the raw viewport
   gutter, so the wordmark, the h1 and every plate share one left edge at 1920.
2. Title block: line 3 becomes the status mark "Dependency graph, available today"; the "Drawn without WebGL" line
   stays, shown only when a missing or unusable WebGL 2 is the reason for the still drawing (not under reduced
   motion, where the still drawing is the visitor's own choice).
3. The interactive end card becomes a crown hold. Caption "The crown of CodeVerse, 15 levels up." over "It depends
   directly on 1 file, and through it stands on 137 files and 40 foundations." (computed). The four trace buttons
   move to the landing.
4. Gauge: the "+" sign moves from graphite to ink-faint (graphite is never text: a11y/B9's rule); the gauge label
   gets the labels' knock-out ground (at the climb the chains cross "level above the ground").
5. Hover and tap identity stays two lines, path and one computed sentence, as fileNote writes it; the landing readout
   carries the fuller identity.
6. Copy: the text alternative's "31 entry points" (claims/C12: entryPoints is an IR term, and the document lists 4)
   becomes "31 files depend on other files while nothing depends on them" (the finisher made this change at 00:44;
   keep it). The sentence separating what is computed for the drawing from what is drawn stays.
7. Accessibility: the visual captions become aria-hidden; the narration block carries the words; the section drops
   aria-describedby on a seven-sentence block (a screen reader would read it all on entry).
8. Optional, creative judge decides: at the plan beat, name up to 8 of the 13 folders under CodeVerse's src/ on the
   board's rim (mono micro labels through the existing label layout, only while the plan caption shows), with the
   transcript sentence "Directories are the boundaries Katedrala records today; modules are planned for v1." It
   answers the brief's "boundaries become visible" honestly. Drop it if the plan beat is not clean at 390.

#### Act II: "Every conclusion has evidence." (real; Available today)

Subject: the dependency from src/analysis/analysis-service.ts (369 lines, 13 symbols, level 9) to
src/analysis/cache-key.ts (51 lines, 4 symbols, level 1). Between them Katedrala recorded three relationships and
seven observations: imports at 25:1 (import-declaration, relative-path); calls createAnalysisService to
graphCacheKey at 219:17 and 273:19 (call-expression, import-binding; this is REAL_EDGE); calls
createAnalysisService to latestGraphPointerKey at 164:37, 189:9, 190:9 and 358:43. Symbol ranges from the
document: createAnalysisService lines 141 to 369; in cache-key.ts stableStringify 19 to 27 (not exported),
limitsHash 30 to 38, graphCacheKey 40 to 46, latestGraphPointerKey 49 to 51.

| Beat | Camera and drawing | Caption (title / body) |
|---|---|---|
| E0 | Crane down from the crown hold to the dependency, framed diagonally; everything else steps back to about 15 percent; the dependency is lit in load blue (it is what is active) | (none) |
| E1 | Leader labels on both ends: "369 lines, 13 symbols, level 9" and "51 lines, 4 symbols, level 1" | "Every line in the drawing has a record behind it." / "This one runs from `src/analysis/analysis-service.ts` down to `src/analysis/cache-key.ts`." |
| E2 Parse | The two files open as rulers beside their rings, hairline line scales: analysis-service.ts 1 to 369 as the full-height scale, cache-key.ts 1 to 51 as a detail at four times that scale with its scale written on it (an architect's detail callout). Symbol spans as brackets: createAnalysisService on the left; the four functions on the right | "Katedrala parses each file into its symbols." / "`cache-key.ts` declares four functions. Across CodeVerse: 3,766 symbols in 594 files." + Available today |
| E3 Link | Seven leaders from the observed lines on the left ruler to what they bind to: 25 to the file head, 164, 189, 190 and 358 to latestGraphPointerKey, 219 and 273 to graphCacheKey | "Then it binds references to what they name." / "Between these two files: one import and calls to two of its functions, seven observations in all. What cannot be bound is counted, never guessed." + Available today. Title block during E3: "unresolved imports 0", "unresolved references 155", "untyped references 2,055" (repository.stats; their definitions from docs/ARCHITECTURE.md go in the narration block) |
| E4 Evidence | The REAL_EDGE record appears (ui/CodeBlock, label "real output: CodeVerse at 6b942bc", copy button named after its block); hairline leaders tie its two "line" entries to the 219 and 273 leaders, which light; the others step back | "Every conclusion has evidence." / "Every relationship points to the lines of code it came from, and every score will break down into its measurements." (the fixed Evidence lede) |
| E5 | Pull back to the whole structure; every chain brightens once, then settles | "14,233 relationships, each recorded like this one." / "`calls` 4,866, `uses` 3,459, `references-type` 2,964, `imports` 2,616, and 328 of six other kinds." The narration block adds: "The drawing joins source files wherever one depends on another at runtime: 1,369 dependencies." |

Phones: the dependency fills the upper half of the tall frame; the two rulers sit side by side in the lower half
with the leaders between them; the record condenses to its provenance rows in the frame (the full JSON stays in the
narration block and in still mode); no text under 11 px.

#### Act III: "Know what a change will touch before you make it." (real trace; Planned for v1)

Subject: src/graph/model/types.ts, a foundation of 471 lines. Scope is stated: the trace follows runtime
dependencies between source files. Throughout the act the title block's third line reads "Impact analysis, planned
for v1", so the status never leaves the numbers it qualifies.

| Beat | Camera and drawing | Caption (title / body) |
|---|---|---|
| C1 | Three-quarter view of the whole standing structure; types.ts lit at the base | "Know what a change will touch before you make it." / "Katedrala will trace dependency paths out from a change to estimate its structural blast radius, path by path." (the fixed Impact copy) + Planned for v1 |
| C2 | A slow orbit begins | "What happens if you change `src/graph/model/types.ts`?" / "A foundation of 471 lines. 48 files depend on it directly at runtime." |
| C3 | The change rises step by step, the load wave reversed: the shortest-path tree lights one step at a time; a counter set like the level gauge, labelled "files reached", reads 48, 126, 143, 147 | "The change travels up through everything that rests on it." / "48 directly, 78 through one other file, 17 through two, 4 through three." |
| C4 | The path from the crown down to types.ts is drawn bold and named: `src/app/page.tsx` to `src/components/landing/landing-page.tsx` to `src/components/landing/features.tsx` to `src/components/landing/feature-mockups.tsx` to `src/graph/model/types.ts` | "147 of the 404 source files rest on it." / "Count type-only dependencies too and it is 265 source files; with the tests, 409 files." Scope line beside the numbers, not in a footnote: "Traced by this page over the dependencies in Katedrala's analysis of CodeVerse." |

#### Landing: "Trace any file."

The camera settles on the still camera's three-quarter view, so the landing and the still mode share one
composition. Desktop: controls left (aligned to the page frame), structure right, title block bottom right. Phones:
a bottom sheet over the frame's foot, the structure above it.
- h2 "Trace any file." and one sentence: "Hover or tap a file in the drawing, or choose one here. Load blue shows what
  it stands on, or what rests on it."
- A radio group "Show": "What it stands on" / "What rests on it" (APG: one Tab stop, arrow keys).
- A native select "File" with all 404 files in optgroups: the 13 folders under src/, and src/ itself for the one
  file at its root (14 groups), themed to the sheet.
- Quick picks (buttons, aria-pressed): src/app/page.tsx, src/graph/model/types.ts, src/lib/languages/registry.ts,
  src/lib/utils/cn.ts.
- A readout (role=status, aria-atomic, one sentence of 25 words or fewer). Rests on it: "88 files rest on
  src/lib/utils/cn.ts at runtime, 63 directly; 90 with type-only dependencies; 113 with tests." Stands on: "{path}
  stands on {n} files at runtime, {m} of them foundations." Nothing chosen: "Choose a file to trace it."
- Hovering a lit file shows its shortest path to the subject. Escape clears the trace. A hover or a pinned trace
  always wins over an act's own lighting.
- The legend (always visible on desktop, a disclosure on phones): ring = source file sized by its lines; solid disc
  = foundation; line = runtime dependency; height = level; line weight and positions are drawn by this page. Under
  it, "How to read the drawing" (a details element) with the six notes from ReadingNotes, and the data note ending
  "CodeVerse is a separate open-source project, and Katedrala does not depend on it."

#### The hand-off

After the landing hold the pin releases with a plain scroll: the frame, its title block and the landing's controls
leave upward together; no fade to black, no cut. The hinge plate opens with its hatched board, so the first thing
after the film is the same ground, drawn flat.

#### Still mode (reduced motion, no usable WebGL 2, or a script that fails)

The film becomes an illustrated article in normal flow: the hero; Act I's narration with one still drawing of the
standing structure; Act II's block with a still drawing framed on the dependency (rulers and leaders drawn) and the
full record; Act III's block with types.ts's dependents lit, the counts, the path and the scope line; the landing's
controls and legend. Still drawings are Canvas 2D (the prototype's Fallback, given per-act cameras, lit masks and a
plan view), so three.js and GSAP are never downloaded in this mode; the iter14 captures show the WebGL still frame
and the 2D fallback are already nearly identical. Canvases draw when within one viewport, at a pixel ratio capped at
2, and at most two hold pixels at a time. Tracing works with instant lighting. Without JavaScript the text and
the record are all present and empty canvases are hidden (html:not([data-js])). The mode is decided once per load
(the mode script in head; the WebGL probe falls back to still before anything moves).

### 1.5 Brief coverage matrix

| Brief requirement | Where it is met | Real or demonstration | Status shown |
|---|---|---|---|
| Hero headline, one or two sentences, "Explore Katedrala" and "View on GitHub" | Film hero frame | Real | Title block |
| Hero visual: structure reconstructed in real time, settles into a coherent structure | Act I (plan, hang, turn, stand) | Real | Dependency graph, available today |
| Modules emerge, boundaries become visible | Act I folders on the plan (optional item 8); explorer's module view | Real folders; demo modules | Module inference, planned for v1 |
| Interactive: highlight, illuminate relationships, dim the rest, show identity | Film hover and tap everywhere; landing | Real | Title block |
| From code to architecture: five passes | Hinge plate; Parse and Link performed in Act II | Real (2), demo (3) | 2 Available today, 3 Planned for v1 |
| Architecture graph: nodes, edges, kinds, modules, boundaries, flow; hover, click, focus, zoom, pan | Explorer | Demo | Typed graph available; module inference planned |
| Architectural Gravity | Gravity plate | Demo | Katedrala heuristic, planned for v1 |
| Architectural Entropy | Entropy plate | Demo | Katedrala heuristic, planned for v1 |
| Change impact: query, propagate, counts, "traces dependency paths" | Act III and the landing | Real, page-computed | Impact analysis, planned for v1 |
| Rules: YAML, a violation detected | Rules plate | Demo plus one hypothetical import | Planned for v1 |
| Explainability: why a score, "Every conclusion has evidence" | Act II (relationship evidence); Gravity reasons (score evidence) | Real; demo | Available today; planned for v1 |
| Architecture over time | History plate | Demo | Planned for v1 |
| Built for developers: five commands, polished terminal | Developers plate | Real analyze counts; demo transcripts; real library | CLI planned for v1; library available today |
| Open source: GitHub prominent, the six qualities, the four links | Open source plate, footer | Real | Milestone states |
| Built to power other tools; "an engine, not a visualization product" | Ecosystem plate | Real statuses | Mixed |
| CodeVerse connection and its chain | Ecosystem chain and key plan | Real | Adapter and CodeVerse planned for v1 |
| Final CTA, simpler than the hero | Final statement | | |
| Navigation (Architecture, How it works, Concepts, Developers, GitHub, Get started) | Navbar | | |
| Reusable components (brief's list) | Navbar, Film (Hero), stage/acts (ImpactDemo, ExplainabilityDemo), Pipeline, ArchitectureExplorer, Gravity, Entropy, Rules, History, CommandShowcase (CLIShowcase), Ecosystem, Footer | | |

---

## 2. Remaining sections: how each rises to the film

### 2.1 The plate kit (shared by every plate)

1. Sheets, not cards: a drawing sits on a sheet marked by four crop marks (12 px arms, 1 px, ink-faint), the film's
   photograph device, where a bordered box stands today. Crop marks only ever replace a frame around real content;
   they never float as decoration (Taste: no hairlines as decoration). Code blocks and the terminal keep their 1 px
   frames: they are tools.
2. Title blocks: every drawing carries a mono title block (micro size, ink-faint, knock-out ground) at its sheet's
   bottom right: line 1 the subject ("Demonstration system" or "Katedrala's analysis of CodeVerse"), line 2 a computed
   fact. Real versus demonstration is always stated in the same place as in the film.
3. Status under the heading: the status mark gets its own line directly under the h2, before the lede; the far-right
   aside 700 px away goes (finish review, ceiling; Taste: no floating top-right sub-text). Capability marks stay
   attached to the item they describe.
4. Gauge numerals, the film's level-gauge type (Martian Mono 300, tabular figures, clamp(3.25rem, 1.8rem + 4vw,
   6.5rem), tracking -0.04em), only where a score is the subject: Gravity and Entropy (plus Act III's counter). Load
   blue only when the value measures the active member.
5. Leader-line labels: the active member is named in the drawing with the film's label (mono name, short note,
   knock-out ground, hairline leader to its joint).
6. Hatched ground under every foundation in every elevation drawing.
7. Dependencies are chains: a dependency that appears drops slack and pulls taut (a damped spring with one small
   rebound, about 450 ms, the film's catch); one that disappears lifts out faster (180 ms). Interruptible
   (transitions or WAAPI, never restarted keyframes); instant under reduced motion and on keyboard-initiated changes
   (Emil).
8. Load blue only on what is active now: the selected member and its path, a cycle, a violation, the milestone in
   progress, the active command, focus rings. Never on bullets or decoration (visual/N17).
9. Type: display (Archivo, wdth 76 to 78) for the film hero, the hinge heading and the final statement; heading
   (wdth 80) for plates; word-dropping captions only in the film; Martian Mono only for code, paths and measured
   values; no eyebrows; ledes at most two lines at 1440; small print through the one `.footnote` treatment
   (visual/N7).
10. Space for density 3: plate padding clamp(6.5rem, 11vw, 10.5rem), more space above headings than below, the
    12-column frame, the named bleeds below.
11. No colored border-left or border-right above 1 px and no inset-shadow stripes; no gradients except the film's
    legibility scrims; no glass; one z-index scale in base.css (film layers 0 to 4, nav 40, skip links 60).

Layout families, one per plate (Taste's repetition ban): hanging schedule (hinge), bleed drawing table (explorer),
readout-led composition (Gravity), sticky scrollytelling split (Entropy), contact strip (History), document and
drawing joined by a leader (Rules), schedule and terminal (Developers), construction gauge (Open source),
structural elevation (Ecosystem), statement on the ground (final CTA).

"Stays" below means: the visible text and the accessibility tree of the section as the fix pass left it (captured
in the baseline, gate GB), except the changes listed for that section. Finding ids are written <audit>/<id>.

### 2.2 Hinge plate: "From source code to architecture." (#how-it-works, B3)

- Composition: a hanging chain of five weights from a hatched board labelled "Source code"; each pass hangs from the
  one before (it depends on its output, the film's own grammar), and the document grows downward. Parse and Link are
  solid discs on taut chalk chains; Infer, Analyze and Explain are open rings on dashed graphite chains, a structure
  in construction; the joint between Link and Infer is the construction joint. Desktop: heading block in columns 1 to
  4; the chain as a narrow drawing column; one row per pass: number (01 to 05), verb, text, status, artifact. Phones:
  the same column with the chain at the left edge and the text beside it, which removes the 1024 to 1350 px
  breakage at its root (visual/C1).
- Typography: heading at display scale (the chapter opener after the film); verbs in Archivo 600; artifacts in mono.
- Motion: none. It is the calm after the film.
- Stays: title, lede, all five pass texts and statuses, the static semantics (no tab stops on stages, a11y/A15), the
  honest Link wording (claims/B2, copy/C16), present tense only for Parse and Link (copy/C23), claims/C5 and
  copy/C22 wording.
- Changes: Parse and Link artifacts become real, read from the evidence JSON (Parse: file cache-key.ts, symbols 4,
  function graphCacheKey; Link: edge calls, from createAnalysisService, to graphCacheKey, at analysis-service.ts:219);
  Infer, Analyze and Explain keep PaymentService. The footnote becomes: "Parse and Link show Katedrala's real output
  for CodeVerse, the relationship traced in the film above. Infer, Analyze and Explain preview v1 on the
  demonstration system the rest of this page uses." The page's real-to-demo seam, stated once, plainly.

### 2.3 Explorer: "The whole structure, at every scale." (#architecture, B4)

- Composition: a bleed drawing table. The sheet spans from the left page edge to column 9 (asymmetric bleed) with crop
  marks; the toolbar (Scale radio group, relationship kinds, zoom) is an instrument strip along the sheet's top edge;
  the inspector sits in columns 10 to 12 as a drawing schedule (mono names, hairline groups) rather than a card; title
  block "Demonstration system / 16 members, 8 modules, 23 dependencies, 16 across a module boundary" (computed).
- Motion: enabling a relationship kind drops its edges in as chains; disabling lifts them out; selection lighting as
  now; wheel zoom and held-key panning stay instant (visual/N18); zoom buttons keep their short ease-out.
- Stays: radio-group scale (a11y/B7), one Tab stop and arrow keys (a11y/A15), focused members kept in view (a11y/A4),
  the visible keyboard hint (a11y/B2), bounded pan (a11y/B6), pinch zoom (a11y/A14), routed module edges (visual/M4),
  readable label sizes from 640 to 1279 (visual/M5), kinds hidden in modules view (visual/N11), focus rings
  (a11y/B1), 3:1 marks (a11y/A9), the table alternative and its focusable scroller (a11y/A10), both status marks and
  the lede (claims/B4, copy/C18), copy/C49.
- Mobile: modules view by default; the sheet edge to edge; inspector below; 44 px controls (visual/N12).

### 2.4 Gravity, with the score half of Explain: "Some members hold up more of the system than others." (#gravity, B4)

- Composition: readout-led. Columns 1 to 5: the score in gauge numerals and load blue (it measures the active
  member), "Gravity of {member}", then h3 "Why does {member} score {score}?", then the ledger (ui/TermLedger) with,
  under each term row (TermRow already takes children), its reason sentence: Evidence's REASON logic generalized to
  the selected member, verbs and plurals computed. Columns 6 to 12, bleeding right: the load drawing on the level
  axis, hatched ground under Database, the selected member named by a leader label; the member picker as a row
  under the drawing.
- New device, Explain made visible: each term row has a "Show" toggle (aria-pressed; accessible names "Show reach in
  the drawing" and so on) that lights its evidence: reach = the whole tributary (default), fan-in = direct dependents
  and their edges, spread = callers in other modules, brokerage = members on shortest paths through it. The status
  sentence names the lit members (a11y/B11).
- Motion: changing member by pointer, load arrives in the drawing level by level from the top down into the member
  (60 ms per level, at most 480 ms, ease-out, interruptible); from the keyboard the new state lands at once; switching
  terms crossfades the highlight (150 ms).
- Stays: title, lede, status label, the citations footnote (claims/B6, B7, C8, copy/C15), radio-group keyboard
  behavior (a11y/A5), the atomic status sentence (a11y/A6), the arithmetic as fixed (copy/C2, finish/#7,
  claims/C3), the full reach set on the level axis (finish/#3), ground hatch (finish/#8), betweenness as a sum of
  path shares (claims/C11, copy/C3, C25), phone schedule (visual/M8, N2), joints and edges moving together
  (visual/M11).
- Changes: the "Why" heading and reasons (moved from Evidence.tsx, which B4 reads but does not edit), the term
  toggles, the title block, the status line under the h2.
- Mobile: picker wraps (44 px), the tributary schedule by level, score, ledger with reasons and toggles that also
  mark the schedule.

### 2.5 Entropy: "Structure decays one dependency at a time." (#entropy, B4)

- Composition: sticky scrollytelling split. The module drawing (drawn 1:1, at most 30rem, hatched ground under
  Platform) stays pinned in columns 1 to 6 while columns 7 to 12 scroll: the score in gauge numerals (chalk: a system
  state, not an active member) with its rating, the commit log as a vertical rule with joints (the active joint in
  load blue, finish/#4), each commit row carrying its computed delta in mono (for example "+0.04", derived from the
  displayed scores so the arithmetic closes), then the factor ledger with its evidence lines.
- Motion: applying a commit drops its arc in as a chain; stepping back lifts later arcs out; cycle members light and
  are named in text (a11y/A8). Keyboard steps land at once.
- Stays: title, lede, status, footnote, caption with the two-line reserved cycle sentence on phones, the radio group
  (a11y/B7), the atomic score region (a11y/A6), factor wording (copy/C4, C5, claims/C9), the 1:1 drawing size
  (visual/N8), largest-remainder rounding (claims/C3), 3:1 marks (a11y/A9), hatched ground (finish/#8). The classes
  .entropy-joint and .is-cyclic stop being shared with History (2.6).
- Changes: per-commit deltas, the title block, the status line.
- Mobile: drawing, score, commits, ledger (the commits stay under the score they move).

### 2.6 History: "See the structure drift across commits." (#history, B5)

- Composition: a contact strip, full bleed: five frames sharing 1 px gutters like a proof sheet; frame code (v1 to
  v5) and entropy value in mono along each frame's top edge; the mini drawing; title; change line; the finding in load
  blue only on the frames that have one, with its flagged edge. History stops borrowing .entropy-joint from
  entropy.css: its joint rules move into history.css under history names.
- Motion: none.
- Stays: title, lede, status, note, each frame's text alternative, the list label, titles and capitalized module
  names (claims/C10, copy/C36), the focusable strip only while it scrolls, the peek not sliced (visual/M10, a11y/B5).
- Mobile: horizontal scroll-snap strip, frames about 80vw, scroll padding equal to the gutter, an edge fade as the
  scroll cue (not a "Scroll" label: Taste bans scroll cues).

### 2.7 Rules: "Write down the architecture you intend." (#rules, B4)

- Composition: a document and a drawing joined by a leader. katedrala.config.yaml with line numbers in columns 1 to 5;
  the violation drawing and its report (as a title block) in columns 7 to 12; an SVG leader in load blue runs across
  the gutter from the violated rule's lines to the break mark on the violating arc (recomputed on resize).
- New interaction: one button, "Remove the hypothetical import" / "Add the hypothetical import". Added (the default,
  so the violation shows without interaction and without JavaScript): the arc drops in as a chain, the break mark
  appears, the report reads the error. Removed: the arc lifts out and the report reads "0 errors, 2 rules checked",
  computed with checkRules(EDGES). The report is a short atomic status region.
- Stays: title, lede, status, the "hypothetical change" labelling and note (claims/C2), computed violation values,
  the phone drawing (visual/M7), aligned heights (visual/N9), copy button naming (a11y/B3), per-drawing marker ids,
  3:1 marks.
- Mobile: YAML full width (horizontal scroll with edge fade), the button, the portrait drawing, the report; no
  cross-gutter leader; the rule id in the report links to the YAML lines instead.

### 2.8 Developers: "One command per question." (#developers, B5)

- Composition: keep the schedule beside the terminal (its joints and rule are already the world's schedule device),
  widen the terminal to columns 5 to 12, light the active command's joint in load blue (the active command), and keep
  the terminal header's source line as its title block ("real counts: CodeVerse at 6b942bc" or the demonstration
  system). Below, the two-up band: the library snippet (Available today) and the guarantees as a schedule with rules
  between groups only (Taste: no hairline under every row).
- Motion: as now: a pointer choice prints the transcript line by line (at most 400 ms), a keyboard choice shows it at
  once; nothing else moves.
- Stays: title, lede, status, every transcript (externals as 39 packages, 8 built-ins, 12 environment variables:
  claims/B3, copy/C1), notes (claims/C2), guarantees wording (claims/A2, copy/C55), the tablist pattern and its
  orientation switch, the ink-faint prompt (a11y/B9), wrapped tabs on phones (a11y/B5), the scroll cue on code
  (visual/N13), the README link.
- Mobile: tabs wrap, the question above the terminal, the terminal scrolls with an edge fade, the band stacks.

### 2.9 Open source: "Read every line of it." (#open-source, B5)

- Composition: a construction gauge. Columns 1 to 5: the four facts and the two GitHub actions. Columns 7 to 12: the
  road to v1 drawn as the film's level gauge standing on hatched ground: fifteen ticks numbered 01 to 15 from the
  ground up, done milestones in chalk (built), the one in progress as the 2 px load-blue tick (active now), planned
  ones in graphite (scaffolding), names aligned to their ticks: the project's own climb toward v1. The DOM stays an
  ordered list 01 to 15; the visual order runs bottom-up with the numbers always shown, so the sequence stays
  explicit. This replaces the dot row and the fifteen-row hairline table (Taste: long lists need a different
  component).
- Motion: none.
- Stays: title, lede (no "developed in public": claims/A1, D3), the four facts (copy/C19), milestone names and states
  (claims/C14, copy/C40, C41), the computed progress sentence and its grammatical accessible name (a11y/B10,
  copy/C7), the roadmap link.
- Mobile: facts, actions, then the gauge as a list with its ticks.

### 2.10 Ecosystem and CodeVerse: "Built to carry other tools." (#ecosystem, B5)

- Composition: a structural elevation, full bleed: tools stand as columns on the "Architecture document" beam, over
  Katedrala, over "Your repository", over hatched ground; column stroke by status (solid available, dashed planned,
  corner-dashed after v1) with the status mark on each capital. Below: "Katedrala will power CodeVerse." with its
  paragraph, the separate-project sentence and the two links on the left; the chain (repository, Katedrala, document,
  CodeVerse adapter Planned for v1, CodeVerse Planned for v1) on the right.
- New callback: a key plan, a small still Canvas 2D drawing of the film's standing structure through stage/fallback.ts
  (no WebGL, drawn once when it nears the viewport), captioned "Katedrala's analysis of CodeVerse's own source, as the
  film at the top of this page draws it: 404 files on 16 levels." and linking to #top. It closes the loop between the
  film's subject and the product that will use Katedrala, labelled as this page's drawing, never as CodeVerse's.
- Stays: title, lede (copy/C14), every tool and chain text and status (copy/C42), the separate-project sentence, the
  real counts, separate columns on phones (visual/N14).
- Mobile: columns stacked as separate columns, the chain vertical, the key plan full width.

### 2.11 Final call to action: "Understand your system before you change it." (#get-started, B3)

- Composition: a statement on the ground: the headline in display scale and the condensed width (finish/#8; computed
  wdth 80 today, keep it between 76 and 80), the lede, "Get started" (with the sr-only " on GitHub", a11y/B8) and
  "View on GitHub", then the hatched ground band full bleed. No motion, no drawing: dramatically simpler than the
  hero.
- Stays: all copy (the lede without "built in public").
- Mobile: the same, stacked.

### 2.12 Navbar and footer (B3)

- Navbar: clear while the film's frame lies under it and solid with its rule otherwise, through the prototype's
  mechanism: the director keeps html[data-kfilm-under] current, and the rules of lab/cinematic/film-global.css move
  into nav.css. On a page without the film (none today) the scroll-driven fade remains. Links: How it works
  (#how-it-works), Architecture (#architecture), Concepts (#gravity), Developers (#developers), GitHub, and "Get
  started". Stays: the menu disclosure in its own nav landmark with Escape, outside press, link choice and Tab-away
  closing it (a11y/A7, visual/M9), 44 px targets on coarse pointers, focus not obscured (a11y/A3).
- Footer: the same links and texts (a11y/B8), set as a drawing's title block: hairline cells, mono only for the
  license line's measured facts, no new copy.

---

## 3. Production file plan

### 3.1 Tree (owner in brackets: B1 to B5, section 4)

```
site/
  app/
    layout.tsx                    [B3] head: the data-js script, then FILM_MODE_SCRIPT (from components/stage/mode.ts);
                                       skip links "Skip to content" (#main) and "Skip the film" (#how-it-works);
                                       metadata unchanged (claims/B1, copy/C54)
    page.tsx                      [B3] new composition (3.4)
    globals.css                   [B3] + styles/plates.css; - styles/impact.css at the switch
    styles/base.css               [B3] tokens --text-gauge, --ease-spring, --plate-pad, z-index scale;
                                       html[data-kfilm="film"] { scroll-behavior: auto }
    styles/plates.css             [B3] NEW: plate kit (sheet, crop marks, title block, status line)
    styles/nav.css                [B3] + the film rules from lab/cinematic/film-global.css; member-card and
                                       drawing-card rules removed with the hero
    styles/sections.css status.css pipeline.css                          [B3]
    styles/explorer.css gravity.css entropy.css rules-evidence.css drawing.css code.css   [B4]
    styles/history.css developers.css open-source.css ecosystem.css      [B5]
    styles/impact.css             DELETE [B3] at the switch
    lab/                          ARCHIVE, then DELETE [B3] at the end
  components/
    stage/                        NEW: the promoted film
      Film.tsx                    [B1] server shell: section, hero frame, Act I narration, act slots, anchors, title block
      FilmClient.tsx              [B1] client island (from lab)
      film.module.css             [B1] from cinematic.module.css (its .button and .nav styles dropped)
      mode.ts                     [B1] FILM_MODE_SCRIPT (the prototype's MODE_SCRIPT), imported by layout.tsx
      model.ts sim.ts shaders.ts stage.ts   [B1] moved, API unchanged
      fallback.ts                 [B1] moved; gains setCamera(), per-act lit masks, a plan view for the key plan
      timeline.ts                 [B1] ACTS table, Act I beats as the finisher leaves them, act offsets, actAt(p), STOPS
      director.ts                 [B1] from film.ts (class Director): scroll clock, act dispatch, labels, crop marks,
                                       focus reveal, data-kfilm-under, page keys
      act.ts                      [B1] the act interface (3.3)
      still.ts                    [B1] still-mode controller: Canvas 2D frames per act, no three.js, no GSAP
      Legend.tsx copy/hanging.ts copy/legend.ts   [B1] from copy.ts and ReadingNotes, with the fixes of 1.4
      README.md                   [B1] from the finisher's README, updated for the acts and the measurements
      acts/                       [B2] (trace.ts from the start; B1 creates the other files as typed stubs at G1,
                                       then never edits acts/ again)
        index.ts                  act registry read by the director
        evidence.ts change.ts landing.ts   act controllers
        trace.ts                  reachability and shortest-path trees, both directions, three scopes
        copy.ts                   Acts II, III and landing words; numbers only from data
        EvidenceAct.tsx ChangeAct.tsx LandingAct.tsx   server markup: narration blocks, record, controls
        acts.module.css
    sections/
      Pipeline.tsx FinalCta.tsx   [B3]
      Architecture.tsx ArchitectureExplorer.tsx Gravity.tsx GravityStage.tsx Entropy.tsx EntropyStage.tsx Rules.tsx  [B4]
      History.tsx Developers.tsx CommandShowcase.tsx OpenSource.tsx Ecosystem.tsx  [B5]
      CodeVerseKeyPlan.tsx        [B5] NEW client island; imports stage/fallback.ts and stage/model.ts read-only
      Impact.tsx ImpactStage.tsx  DELETE [B3] after G3
      Evidence.tsx                DELETE [B3] after G4
    hero/                         DELETE [B3] at the switch
    drawing/LoadDrawing.tsx       [B4] (hero-only props trimmed after the switch)
    drawing/chain-motion.ts       [B4] NEW: the drop-and-pull-taut spring for SVG paths (WAAPI or rAF, interruptible)
    ui/Section.tsx Status.tsx Button.tsx   [B3] (Section gains `status`; `aside` kept until every caller moves, removed at G5)
    ui/Plate.tsx TitleBlock.tsx CropMarks.tsx   [B3] NEW
    ui/TermLedger.tsx CodeBlock.tsx   [B4] (CodeBlock is imported read-only by B2 and B5)
    site/Navbar.tsx MenuDisclosure.tsx Footer.tsx Wordmark.tsx   [B3]
    lab/                          ARCHIVE, then DELETE [B3] at the end
  lib/site.ts lib/text.ts         [B3] (read by all)
  lib/demo/*.ts                   [B4], except lib/demo/commands.ts and lib/demo/history.ts [B5]
  public/data/codeverse-graph.json      unchanged
  public/data/codeverse-evidence.json   [B2] NEW, generated
  scripts/build-codeverse-graph.mjs     unchanged
  scripts/build-codeverse-evidence.mjs  [B2] NEW: reads the CodeVerse document, writes the evidence JSON
  scripts/check-links.mjs serve.mjs     unchanged (the launch gate and the static preview)
  README.md                       [B3] content rules: the two generated data files and their scripts
  PRODUCT.md                      unchanged
  .impeccable/surfaces/app-page-tsx.md  [B3] rewritten as in 3.6
  DESIGN.md, .impeccable/design.json    written by impeccable-documenter after the finish (section 6)
```

What moves out of site/components/lab/cinematic/: everything. CinematicHero.tsx becomes stage/Film.tsx (the card
removed), film.ts becomes stage/director.ts, copy.ts becomes stage/copy/hanging.ts, ReadingNotes.tsx becomes
stage/Legend.tsx with copy/legend.ts, cinematic.module.css becomes stage/film.module.css, film-global.css is folded
into nav.css and deleted, LabNav.tsx is dropped, README.md becomes stage/README.md, and model, sim, shaders, stage,
fallback, mode and timeline move as they are and are then extended. Until the switch,
site/app/lab/cinematic/page.tsx renders the new stage Film as the preview route.

What is deleted at the end: site/app/lab/ and site/components/lab/ entirely, after copying both (including the
abandoned drawing and physical prototypes, which are untracked and which git cannot restore) to
scratchpad/lab/archive/; site/components/hero/; Impact.tsx, ImpactStage.tsx, Evidence.tsx; styles/impact.css (B3);
the evidence rules of rules-evidence.css (B4, its owner); exports nothing imports any more, each by its owner
(IMPACT_TARGETS in lib/demo/impact.ts and hero-only LoadDrawing props by B4; member-card and drawing-card rules by B3).

### 3.2 Data loading

On the server, Film.tsx imports both JSON files, builds the model once (layout iterations at build time), computes
the summary, captions, narration, the evidence numbers and the trace numbers, and passes to the client only the rest
positions (1,212 numbers, as today) and the small evidence object. The browser fetches the graph JSON once
(preloaded with react-dom's preload, as now) to rebuild the model with the server's positions; the evidence data
never needs a fetch. The key plan reuses the same JSON from the cache. Nothing imports the graph JSON into a client
bundle.

### 3.3 The act interface (B1 defines at G1, B2 implements)

```ts
// components/stage/act.ts
export type ActId = "hang" | "evidence" | "change" | "trace";
/** What is lit (load blue) and how far everything else steps back (0..1). */
export interface LitMask {
  readonly nodes: Uint8Array;
  readonly edges: Uint8Array;
  readonly dim: number;
}
/** A box on the frame, CSS px from its top left (as the director's label layout uses it). */
export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}
export interface ActDefinition {
  readonly id: ActId;
  /** Pinned scroll length in viewports, per framing. */
  readonly length: { readonly wide: number; readonly tall: number };
  /** Local 0..1 stops for Space, Page Down and Page Up. */
  readonly stops: readonly number[];
  /** Camera keys in local t ([t, yaw, pitch, distance, tx, ty, tz, fov, lensX, lensY]); the first key must equal
   * the previous act's last key, so the camera never cuts. */
  cameraKeys(model: HangingModel, framing: Framing): readonly (readonly number[])[];
  /** What is lit at local t, and how far the rest steps back; null leaves the structure unlit. */
  lit(t: number, model: HangingModel): LitMask | null;
  /** DOM overlays (rulers, leaders, counters, controls) bound once, placed every drawn frame. */
  mount?(ctx: ActContext): ActOverlay;
  /** Still mode and the 2D fallback: one camera and one lighting for this act's figure. */
  readonly still: { camera(model: HangingModel, framing: Framing): CameraState; lit(model: HangingModel): LitMask | null };
}
export interface ActContext {
  readonly root: HTMLElement;
  readonly model: HangingModel;
  readonly framing: Framing;
  /** Screen position of a file or a world point in the last drawn frame (CSS px). */
  screenOf(v: number, out: ScreenPoint): ScreenPoint;
  screenOfWorld(x: number, y: number, z: number, out: ScreenPoint): ScreenPoint;
  /** Boxes labels must keep clear of (the director's obstacle list). */
  obstacles(): readonly Box[];
}
export interface ActOverlay {
  update(t: number): void;
  dispose(): void;
}
```

Act I is wrapped in the same interface by B1 (its beats keep their own BEAT table in local t). A pinned or hovered
trace always overrides an act's lighting.

### 3.4 app/page.tsx

```tsx
import { Film } from "@/components/stage/Film";
import { Architecture } from "@/components/sections/Architecture";
import { Developers } from "@/components/sections/Developers";
import { Ecosystem } from "@/components/sections/Ecosystem";
import { Entropy } from "@/components/sections/Entropy";
import { FinalCta } from "@/components/sections/FinalCta";
import { Gravity } from "@/components/sections/Gravity";
import { History } from "@/components/sections/History";
import { OpenSource } from "@/components/sections/OpenSource";
import { Pipeline } from "@/components/sections/Pipeline";
import { Rules } from "@/components/sections/Rules";
import { Footer } from "@/components/site/Footer";
import { Navbar } from "@/components/site/Navbar";

export default function Page() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Film />
        <Pipeline />
        <Architecture />
        <Gravity />
        <Entropy />
        <History />
        <Rules />
        <Developers />
        <OpenSource />
        <Ecosystem />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
```

If measurement shows the plates' hydration delaying the film's first frame by more than 150 ms against the preview
route, wrap each plate after the film in its own Suspense boundary (server-rendered, no fallback) so the film island
hydrates first, and measure again.

### 3.5 Shared pieces and contracts between builders

- Copy: the film's words live in stage/copy/ (Act I, legend: B1) and stage/acts/copy.ts (Acts II, III, landing: B2).
  Every number comes from the summary, the evidence JSON or trace.ts and is formatted with formatCount; no digit
  literals except in formatting. Plates keep their copy in their own components, as fixed.
- The scroll timeline: stage/timeline.ts is the single clock: ACTS (order and lengths per framing), actAt(p), act
  offsets, STOPS for the page keys, and the anchor offsets Film.tsx uses to place #film-start, #evidence, #impact and
  #trace (accounting for the 5rem scroll padding). The track height is set server-side from the ACTS lengths (a CSS
  custom property on the track). Plates do not use it: they have no scroll-scrubbed motion.
- Motion primitives: the film's spring (the CSS linear() curve) becomes the --ease-spring token in base.css;
  drawing/chain-motion.ts provides the SVG drop-and-pull-taut used by Entropy, Rules and the explorer; the plate kit
  lives in ui/Plate.tsx, TitleBlock.tsx, CropMarks.tsx and styles/plates.css.
- Attributes on html, set by B1 only: data-kfilm ("film" or "still", by the mode script), data-kfilm-under (frame under
  the navigation), data-kfilm-ready, data-kfilm-live; data-js is set by layout.tsx (B3). B1 styles them in
  film.module.css; B3 reads data-kfilm and data-kfilm-under in nav.css and base.css.
- Anchor ids (stable, so old deep links to #evidence and #impact still land): #top, #film-start, #evidence, #impact,
  #trace (in the film), #how-it-works, #architecture, #gravity, #entropy, #history, #rules, #developers,
  #open-source, #ecosystem, #get-started.
- Performance marks: kfilm:stage-ready, kfilm:first-frame, kfilm:act-<id>. The dev-only handle window.__kfilm stays
  (NODE_ENV not production) for the scrub tooling.
- REAL_EDGE stays canonical in lib/site.ts; the evidence JSON is the generated superset and must deep-equal it on its
  REAL_EDGE entry.

### 3.6 The direction contract (B3 rewrites, at the switch)

In .impeccable/surfaces/app-page-tsx.md keep THESIS, OWN-WORLD, FORM and FINISH. Replace:
- Chosen direction and memorable moment: "Load Path, as the cinematic film the user chose on 2026-10-07. Memorable
  moment: Katedrala's real analysis of CodeVerse hangs from its 91 foundations like Gaudí's chain model, is turned
  over and stands; load runs down to the ground; later a change rises from one file through everything that rests on
  it."
- STORY: "Visitors watch real code stand up: CodeVerse's 404 source files hang from their foundations, turn over
  into a standing structure and carry load to the ground; the camera dives to one real relationship and its lines of
  code; a change to one foundation rises through everything resting on it; visitors trace any file themselves; then
  the demonstration system previews what v1 adds, every capability marked with its status."
- FIRST VIEWPORT: "Left five columns of the page frame: the two-line headline 'See what your code stands on.', one
  sentence, two actions (Explore Katedrala, View on GitHub). Right seven columns: a pen sets out CodeVerse's 91
  foundations on an elliptical plan and the first level of files drops; a title block states that this is
  Katedrala's analysis of CodeVerse at 6b942bc and that the dependency graph is available today; hovering or tapping
  a file lights what it stands on and names it."
- Constraints line: the status vocabulary of D1 ("Available today", "Planned for v1", "Planned after v1").
- Proof line: add "the 404 source files and 1,369 runtime dependencies the film draws".

---

## 4. Build split: five builders, disjoint files

### 4.1 Gates

- GF (external): the cinematic finisher has returned; site/components/lab/cinematic/README.md and
  scratchpad/lab/cinematic/final/ exist. B1 moves code only after GF. B2's generator and trace.ts need nothing.
- G0 (external): met. The fix pass finished; .impeccable/review and site/out were rebuilt on 2026-10-08 00:26.
- GB (B3, first task): the baseline exists in scratchpad/lab/promotion/baseline/ (4.4 item 1). Nobody edits an
  existing page file before it. B1 and B2 work in new files and on the lab route, so they may start.
- G1 (B1): components/stage renders Act I end to end at /lab/cinematic/, the act interface and act stubs exist, still
  mode's infrastructure works, FILM_MODE_SCRIPT is exported. Unblocks B2's acts, B3's layout head and B5's key plan.
- G2 (B3): the plate kit (Plate, TitleBlock, CropMarks, Section `status`, tokens, plates.css) is landed. B4 and B5 may
  restructure content from GB and adopt the kit from G2.
- G3 (B2): Acts II, III and the landing are complete. Unblocks removing Impact.
- G4 (B4): Gravity carries the reasons. Unblocks removing Evidence.
- G5 (B3): the switch: page.tsx composed, removed sections deleted, Section's `aside` removed, the surface brief
  rewritten; then the lab archived and deleted.
- GM (external, before the reviews): M5 reconciliation. Another workflow is building milestone 5 (architectural
  inference) and will mark it Done in docs/ROADMAP.md only if everything passes, writing
  scratchpad/m5-site-followups.md. B3 re-reads docs/ROADMAP.md and mirrors it in MILESTONES; each item of the
  follow-up list is applied by the owner of its file (Pipeline's Infer status: B3; the explorer's module-inference
  mark: B4; the Ecosystem chain text: B5). Without that file, nothing changes.
- GI (integration, orchestrator): one `pnpm build`, the capture set of section 6, axe and the detector; only then the
  reviews. Builders never run pnpm build.
- Reviews (section 6) run in parallel after GI; their findings go to one file; the owners fix them in one batch; one
  confirm round follows.

Every builder: read the brief, this plan, D1 to D9 (scratchpad/fix-workflow.js), the three skills (Taste with dials
9/9/3, Emil, Impeccable SKILL, then craft-floor immediately before any UI edit), and run the Impeccable launcher's
`context --target app/page.tsx` once. Rules: edit only your files; never run pnpm build, pnpm add or a git command
that writes; type-check with `pnpm exec tsc --noEmit` in site (errors in other owners' files are their work in
progress); format with `npx prettier --write <files>` from the repository root; verify on the dev server at 1440x900
and 390x844 (plus 768, 1024, 1280x720 and 844x390 where a layout changes) with the Playwright harness in
scratchpad/shots (Edge, `channel: "msedge"`, default arguments: they render WebGL on this machine's GPU); keep
scripts in scratchpad/shots/<builder>/. Report: what changed per item, files changed, items needing another owner,
measurements.

### 4.2 B1, film engine and promotion (after GF)

Owns: site/components/stage/** except acts/** after G1; site/app/lab/cinematic/page.tsx as the preview route until
G5.

Does:
1. Moves the prototype into components/stage as in 3.1, keeping it running at /lab/cinematic/.
2. Builds the multi-act clock (timeline.ts) and the act interface (act.ts); the director dispatches captions, lit
   masks, overlays and camera by act; camera keys are continuous at act boundaries; typed stubs in acts/ at G1.
3. Act I changes 1 to 8 of 1.4.
4. Still mode: per-act Canvas 2D frames through still.ts and the extended Fallback (cameras, masks, plan view); no
   three.js or GSAP request in still mode; the illustrated-article layout; "one text, two presentations"; no-JS hides
   empty canvases.
5. Keyboard: focus reveal (an in-film control that receives focus brings the film to the beat where it is visible;
   the hero actions bring it back to the hero); anchor markers; "Explore Katedrala" as a short smooth scroll in film
   mode and an instant jump otherwise; page keys step through every act's stops while pinned.
6. Performance: the marks of 3.5, kfilm:first-frame on both the WebGL and the 2D path; the pixel-ratio step-down
   kept; the rAF loop stops when the film is offscreen or the tab hidden, and whenever nothing moves; exactly one
   WebGL context (the probe's context released, as now); dispose on unmount; ScrollTrigger.config({
   ignoreMobileResize: true }). FilmClient prefetches the stage and GSAP only after the WebGL 2 probe (with
   failIfMajorPerformanceCaveat) has passed and the mode is "film" (at 00:46 it still prefetched on the mode script's
   API check alone, so a browser with the API but no usable context downloaded three.js and GSAP for nothing).

Acceptance:
- tsc reports nothing in components/stage; prettier clean.
- Act I parity: a side-by-side sheet of the new route against scratchpad/lab/cinematic/final/ at the finisher's
  capture points, 1440x900 and 390x844, shows the same compositions (only the frame-aligned hero copy and the crown
  hold differ).
- actAt(p) is contiguous and monotone over [0, 1] (a small script prints the table).
- With reduced motion, and with WebGL disabled (`--disable-webgl --disable-3d-apis`), the network log has no three.js
  chunk and no gsap; every act block shows its still drawing; mouse and tap tracing work.
- #film-start, #evidence, #impact and #trace land on their beats with the caption visible and nothing under the nav,
  in film and still modes.
- Tab from the hero actions reaches the first in-film control with the film at its beat and the control visible;
  Shift+Tab returns; no focused element is invisible or obscured.
- At the landing with no input for 2 s the director renders 0 frames; with the film offscreen, 0 rAF callbacks.
- FILM_MODE_SCRIPT placed in head: no flash of the wrong layout on reload at any scroll position.
- 1280x720 and 844x390: the hero actions are visible without scroll, no caption runs under the nav, the crown hold
  reads (review0 found the 844x390 end card under the nav).
- No visible "entry point" for the build script's top files; the gauge's "+" is ink-faint.

### 4.3 B2, Acts II and III, the landing, the evidence data (generator and trace now; acts after G1)

Owns: site/components/stage/acts/** (acts/trace.ts from the start, the rest after G1),
site/scripts/build-codeverse-evidence.mjs, site/public/data/codeverse-evidence.json.

Does:
1. The generator: reads the CodeVerse document (path as argument, like build-codeverse-graph.mjs; the stored one is
   %TEMP%/codeverse-structure-2.json), writes source metadata (repository, commit, generator, schema version), the
   two files' facts (lines, symbol counts, levels from the graph JSON), the symbols of both with their ranges
   (createAnalysisService and the four functions of cache-key.ts), the three relationships with every provenance
   entry, REAL_EDGE's id, the edge-kind counts and the needed repository.stats. Byte-identical on rerun.
2. trace.ts: reachability and shortest-path trees in both directions over three scopes (runtime source, plus
   type-only, plus tests), folder groups, per-step counts, deterministic tie-breaking by path.
3. Acts II and III and the landing as in 1.4 (controllers, overlays, narration blocks, record, controls, readout),
   wide and tall framings, still frames and masks through B1's interface.

Acceptance:
- Two runs of the generator produce identical bytes; its REAL_EDGE deep-equals lib/site.ts REAL_EDGE; the JSON is
  under 8 KB.
- No hand-typed numbers: a scan of acts/copy.ts finds no numeric literals outside formatting.
- Act II at 1440 and 390: the dependency is on screen and lit; the symbol names, the seven observed lines (25, 164,
  189, 190, 219, 273, 358) and the record are legible at 11 px or more; the 4x detail states its scale; both
  Available today marks present.
- Act III: per-step counts 48, 126, 143, 147; 265 and 409 in the scope sentence; the crown path lit and named; Planned
  for v1 beside the act title and in the title block for the whole act; the scope line beside the numbers.
- Landing: the Show radio group follows the APG pattern; the select lists 404 files in 14 folder optgroups and is
  themed (no light browser default on the dark sheet); quick picks expose aria-pressed; the readout is role=status,
  aria-atomic, one sentence of 25 words or fewer; Escape clears; everything works in still mode.
- The film's accessibility tree (Playwright ariaSnapshot) reads as clean sentences with one h2 per act, each act once;
  axe reports 0 violations at the hero, E4, C4 and landing beats in film and still modes, at 1440 and 390.

### 4.4 B3, shell, hinge, final statement, primitives, integration (now)

Owns: app/page.tsx, app/layout.tsx, app/globals.css, styles/base.css, nav.css, sections.css, status.css,
pipeline.css, plates.css (new); components/site/*; components/ui/Section.tsx, Status.tsx, Button.tsx, Plate.tsx,
TitleBlock.tsx, CropMarks.tsx (new); components/sections/Pipeline.tsx, FinalCta.tsx; lib/site.ts, lib/text.ts;
site/README.md; .impeccable/surfaces/app-page-tsx.md; every deletion and the archive.

Does:
1. First, before any edit: the baseline. Copy site/.impeccable/review/* (the post-fix captures) and, for every
   section id, record innerText, a Playwright ariaSnapshot, the list of controls with role, name and state, and
   screenshots at 1440 and 390, into scratchpad/lab/promotion/baseline/.
2. The plate kit and the tokens (G2); Section's `status` prop beside the old `aside` until every caller has moved.
3. The navbar (the film rules from film-global.css), footer, layout head and skip links, the hinge plate (2.2) and
   the final statement (2.11).
4. The switch (G5): page.tsx, deletions, the README content rules, the surface brief (3.6); then the archive and
   deletion of the lab. GM's MILESTONES reconciliation.

Acceptance:
- The baseline exists before the first edit (timestamps).
- Nav: computed background transparent at film p 0.3 and 0.9, solid past the film; the menu's Escape, outside press,
  link choice and Tab-away behave as before; 44 px targets on coarse pointers.
- Hinge plate: pass rows do not overlap at 390, 768, 1024, 1180, 1280, 1350 and 1440 (bounding boxes); the Parse and
  Link artifacts equal the evidence JSON values.
- Final headline: computed font-variation-settings wdth between 76 and 80; the sr-only " on GitHub" on Get started
  only.
- Whole-site tsc clean; no import of a deleted file; `impeccable detect --json app components lib` returns [].
- A copy and accessibility-tree diff against the baseline for the nav, hinge, final CTA and footer shows only the
  changes listed in section 2.

### 4.5 B4, demonstration plates (now; the plate kit after G2)

Owns: components/sections/Architecture.tsx, ArchitectureExplorer.tsx, Gravity.tsx, GravityStage.tsx, Entropy.tsx,
EntropyStage.tsx, Rules.tsx; components/drawing/LoadDrawing.tsx, chain-motion.ts (new); components/ui/TermLedger.tsx,
CodeBlock.tsx; lib/demo/*.ts except commands.ts and history.ts; styles/explorer.css, gravity.css, entropy.css,
rules-evidence.css, drawing.css, code.css.

Does: sections 2.3, 2.4, 2.5 and 2.7; the chain-motion helper; the Gravity reasons (moved from Evidence.tsx, which B4
reads but does not edit) and the term evidence sets (computed in metrics.ts); the Entropy deltas; the Rules toggle;
after G5, removal of the evidence rules in rules-evidence.css, IMPACT_TARGETS and hero-only LoadDrawing props.

Acceptance:
- A copy and accessibility-tree diff against the baseline per plate shows only the changes listed in 2.3 to 2.7.
- Chain motion runs on commit apply, kind toggle and rule toggle, settles within 600 ms, retargets on rapid input
  without stacking, and lands instantly under reduced motion and on keyboard input.
- Each Gravity term toggle lights its evidence set and the status sentence names the lit members.
- At 390 every drawing's text is 11 px or more on screen; no horizontal overflow from 320 to 430; 44 px controls.
- axe 0 violations per plate in default and reduced motion; detector []; no side stripes; load blue only on active
  things.

### 4.6 B5, History, Developers, Open source, Ecosystem (now; the plate kit after G2; the key plan after G1)

Owns: components/sections/History.tsx, Developers.tsx, CommandShowcase.tsx, OpenSource.tsx, Ecosystem.tsx,
CodeVerseKeyPlan.tsx (new); lib/demo/commands.ts, lib/demo/history.ts; styles/history.css, developers.css,
open-source.css, ecosystem.css.

Does: sections 2.6, 2.8, 2.9 and 2.10, including the contact strip (with its own joint classes), the construction
gauge, the elevation and the key plan (Canvas 2D through stage/fallback.ts, drawn once when it nears the viewport, no
WebGL).

Acceptance:
- A copy and accessibility-tree diff against the baseline per plate shows only the listed changes.
- The tablist keeps the APG pattern and wraps on phones; transcripts print in 400 ms or less from the pointer and
  instantly from the keyboard and under reduced motion.
- History renders identically with entropy.css removed from the page (no shared classes left).
- The key plan loads no three.js, has an accessible name, links to #top, and its caption says it is this page's
  drawing.
- axe 0, detector [], the phone forms as specified.

---

## 5. Budgets and guarantees

Measure on the static export (site/out, served in-process as scratchpad/shots/capture.mjs does, or with
scripts/serve.mjs) after GI; before that on the dev server, labelled indicative. Use Edge with default arguments
(this machine's Intel UHD through ANGLE D3D11); confirm frame budgets on a real mid-range laptop and phone when one is
available.

JavaScript (baseline: the network log of site/out served locally, 2026-10-08, appendix B):
- JS fetched before the film's dynamic imports start: at most 165 KB gzip (the main page fetches 159.4 today:
  framework 133.2, sections 26.2; the hero's client code and ImpactStage leave, the 1.2 KB film island arrives).
  three.js and GSAP are dynamic imports only.
- Film chunks, gzip: three.js plus the stage at most 150 KB (132.7 + 13.3 today), gsap plus ScrollTrigger at most
  46 KB (45.0 today), director plus acts plus trace at most 24 KB (director 11.9 today), fallback at most 4 KB. Data:
  graph JSON 67.9 KB raw / 17.2 KB gzip (keep under 72 KB raw), evidence JSON under 8 KB raw.
- HTML document at most 60 KB gzip (40.2 today; the 404 select options and the narration blocks add to it).
- Still modes (reduced motion, no usable WebGL 2): zero bytes of three.js and GSAP (today: 146 KB of three.js under
  reduced motion, 191 KB of three.js and GSAP with WebGL disabled).

Rendering and responsiveness:
- LCP (the h1) at most 2.0 s on desktop broadband and 2.5 s on a throttled phone profile (Fast 4G, 4x CPU).
- CLS at most 0.02 over a full scroll (the film reserves its track; fonts through next/font; a late still fallback
  changes nothing above the fold).
- INP at most 100 ms for hover tracing, select, radio and toggle changes.
- First visible structure: kfilm:first-frame within 1.2 s of first contentful paint on desktop broadband and 2.5 s on
  the phone profile (the prototype on the local static export: FCP 420 ms, first frame 758 ms); the pen finishes the
  plan within 1.6 s of the first frame. Still mode: the first 2D frame within 0.8 s of first contentful paint. If the
  phone profile misses, add a server-rendered board outline under the canvas that fades as the pen begins, and
  measure again.
- The WebGL probe and the renderer's context creation run once, after first paint; their main-thread cost is
  measured and reported (33 to 220 ms here on the GPU path).
- Frame time in the film: at 1440x900 (pixel ratio up to 2) median at most 16.7 ms and p95 at most 25 ms through the
  hang, the turn, the Act II dive and the Act III wave; at 390x844 median at most 22 ms and p95 at most 33 ms; no more
  than 10 percent worse than the finisher's measurements of Act I. The pixel ratio steps down when the median of 90
  frames exceeds 21 ms. Main-thread script per frame at most 4 ms on desktop and 8 ms on the phone profile. No long
  task over 50 ms while scrolling the film after load.
- Idle: no frames when nothing moves; no rAF at all when the film is offscreen or the tab hidden.
- Memory: exactly one WebGL 2 context; still-mode canvases capped as in 1.4; JS heap stable within 5 percent over
  three full scrolls.
- Page length: at most 26 viewports at 1440x900 and 32 at 390x844; Acts II, III and the landing together at most 4.6
  and 4.5 viewports.

Guarantees:
- Reduced motion: no pinned film; the illustrated article; no springs, waves, printing or dropping words; state
  changes land instantly but their result is drawn (lit paths, named cycles); tracing and every control work. The
  global 1 ms override in base.css stays as the safety net.
- No WebGL: the same still layout, with the title block's "Drawn without WebGL" line.
- No JavaScript: every text, the record and every count are present; empty canvases hidden; plates show their
  server-rendered default state (Rules with the violation shown).
- Keyboard: "Skip to content" and "Skip the film" first; then the nav; the hero actions; in-film controls with focus
  reveal; the plates. Visible 2 px load-blue focus rings; nothing focused sits under the nav or a film overlay
  (WCAG 2.4.11). APG patterns everywhere (radio groups, tablist, toggles, disclosures). Escape clears tracing. Page
  keys step beat by beat while pinned and behave normally elsewhere and inside controls.
- Screen readers: the h1, each act's narration once (h2 per act), the record as code, labelled controls, the legend.
  Canvas, labels, leaders, rulers and the visual captions are aria-hidden. One short atomic live region per widget.
- Phones at 390: the film's tall framing with hero copy on top, structure in the middle and captions at the foot
  (titles at least 24 px, body at least 15 px), labels at least 11 px breaking only after a slash, the landing as a
  bottom sheet with 44 px controls; svh-based frames; no horizontal overflow from 320 to 430; every plate's phone form
  of section 2. Landscape phones (844x390): hero actions visible, captions clear of the nav.

---

## 6. Review plan for the finished page

Five reviews run in parallel after GI; their findings go to one file; the owners fix them in one batch; one
confirmation round follows (Impeccable: bounded passes, two rounds at most).

Captures (taken by the integration step, validated before anyone sees them: every file opened once and shown to
contain what its name says, no blank or black bands, entrance motion settled):
- site/.impeccable/review/desktop.png (1440 wide) and mobile.png (390 wide): full-page stitches from the document top,
  in still mode (reduced motion), because a pinned film in a stitch is one frame and a long blank band; plus
  desktop-<id>.png and mobile-<id>.png per section id and desktop-first-viewport.png, mobile-first-viewport.png in
  film mode.
- site/.impeccable/review/film-d.png and film-m.png: contact sheets of every film beat of 1.4 (scrubbed with the lab
  tooling, scratchpad/shots/lab-cinematic/scrub.mjs adapted to the new anchors), plus per-beat frames, hover, tap,
  landing states, the no-WebGL and reduced variants, and 1280x720 and 844x390 first viewports.
- Section captures of every plate at 390, 768, 1024, 1280 and 1440.

1. Impeccable finish review: the shipped impeccable-finish-reviewer, spawned fresh with no conversation history,
   with this packet: the user's request (the brief plus "I like the cinematic one very much... promote it to be the
   main site"), the artifact path site/app/page.tsx, every capture path above named as required, the rewritten
   direction contract, PRODUCT.md, the detector output (`impeccable detect --json app components lib`, which must be
   [] before the packet goes), the craft-floor path, and as critique reference the user-approved prototype captures
   (scratchpad/lab/cinematic/final/; there is no comp, this is a code-led build). It judges fidelity to the
   contract's FIRST VIEWPORT, memorable moment and STORY with the TYPE, MATERIAL and GROUND rows; the craft floor's
   Verify list; every refusal; the ceiling (the world's devices in use: hanging and standing, load waves, title
   blocks, crop marks, hatched ground, line weight by load, the head-to-tail ledger); ten distinct layout families;
   coverage of every brief requirement findable within seconds; that a first-time visitor knows what this is, why it
   matters and what to do within seconds (Persuade). Act on its disposition: recapture, rebuild, fix (one batch,
   recapture, a verdict pass by the same reviewer scoring each material fix) or ship. After the last correction the
   shipped impeccable-documenter writes DESIGN.md and .impeccable/design.json (token-bearing); site/README.md already
   points at DESIGN.md. If any raster ships (none is planned), `impeccable embed-prompt --scan` must clear it.
2. Creative judge (an Awwwards jury member with Taste dials 9/9/3 and Emil's standards): the first three seconds;
   pacing (no stretch of 0.7 viewport without a visible change; each act has one image worth remembering: the turn,
   the rulers of real line numbers, the change reaching the crown); the hinge reads as the hinge; the plates rise to
   the film through devices, not adjectives; motion craft (curves, under 300 ms for UI and longer only for the film,
   exits faster than entrances, interruptible springs, nothing animated on keyboard input, the removal test for every
   animation); type scale and rhythm; the phone as a designed film; the final statement simpler than the hero;
   Taste's pre-flight list (em dash zero, theme lock, one accent, one radius system, CTA intents, eyebrow count zero,
   no scroll cues, no hairline under every row); "would this be mistaken for any other site?". Decides the optional
   Act I folder names.
3. Honesty audit: a table of every number on the page traced to its source (graph JSON and the build script's
   definitions, the evidence JSON and the document, lib/site.ts, lib/demo computations), checked by script where
   possible (appendix A is the reference for the film); real versus demonstration stated at the point of display
   (title blocks); a status mark on every capability, beside its claim; present tense only for Available today; no
   "developed in public" or "built in public"; CodeVerse separate and its adapter Planned for v1 (milestone 14); Act
   III's scope line and its Planned for v1 mark for the whole act; levels and reach described as computed for the
   drawing from Katedrala's dependencies; no "entry point" for the build script's top files (claims/C12); "gravity"
   in Act I unmistakably physical (Gaudí), never Architectural Gravity; Act II's Link wording never claims every
   reference binds (copy/C16); CLI transcripts labelled previews with their source line; the meta description; D1
   to D9; MILESTONES equal to docs/ROADMAP.md at review time (GM); the launch gate (claims/A1: `node
   scripts/check-links.mjs` after the build must report 0 failing before deploy; today the repository is not public,
   so the review records the gate as open, not as passed); a copy self-audit (no em dash, thousands separators,
   American spelling); the baseline text diff of every retained plate; the resolution state of every CONFIRMED
   claims and copy finding of review-paired.md in the promoted page.
4. Accessibility audit: axe 0 violations at 1440 and 390 in film mode (hero, E4, C4 and landing beats), still mode and
   no-WebGL; a keyboard walk of the whole page (order, skip links, focus reveal, no obscured focus, visible rings,
   page keys); the accessibility tree of the film and of each plate against the baseline; APG behavior of every
   composite widget; live regions short and atomic; reduced motion; forced colors (selected states visible);
   target sizes (24 px minimum, 44 px for primary controls on phones); contrast (ink-faint the faintest text,
   graphite never text); zoom to 200 and 400 percent (the film switches to its tall framing and stays usable); the
   resolution state of every CONFIRMED accessibility and visual finding of review-paired.md.
5. Performance check: the budgets of section 5 with the network log of each mode, the performance marks, LCP, CLS and
   INP through PerformanceObserver (Lighthouse too if it runs without adding anything to the project), rAF
   sampling of frame times during the hang, the turn, the dive and the wave (also with 4x CPU throttling), long tasks
   while scrolling, the WebGL context count, the heap over three scrolls, offscreen and idle frame counts, resize and
   orientation change (no context loss, framing switch), and the export's total weight.

Verdict: ship only when the finish reviewer's disposition is ship, the honesty and accessibility audits report no
open critical or major finding, and the performance budgets hold (or the user accepts a named exception). Report the
verdict under the reviewer's own word and at its actual scope.

---

## 7. Decisions to confirm with the user, and risks

1. Hero actions: "Explore Katedrala" plays the film (recommended, from the brief) versus the prototype's "Get
   started". Either way the navbar keeps "Get started".
2. The abandoned drawing and physical prototypes are untracked; the plan archives them to scratchpad/lab/archive/
   before deleting site/app/lab and site/components/lab. Say so if they should be deleted without an archive, or kept.
3. Length: about 25.6 viewports at 1440 (the film 12.2). If the creative judge finds the film slow after the new acts,
   trim Act I's circle and freeze by up to 15 percent before touching anything else.
4. Act III shows a change radius the page computes; it is scoped (runtime, then type-only, then tests) and marked
   Planned for v1 for the whole act. If the user prefers impact on the demonstration system only, keep Act III's
   camera and wave on the real structure but move its numbers to the landing readout.
5. The launch gate (claims/A1) stands: the repository must be public with milestones 1 to 4 on main, and
   `node scripts/check-links.mjs` must pass, before the page goes live.
6. Milestone 5 may become Done during the build (GM). Statuses change only through m5-site-followups.md and
   docs/ROADMAP.md, never by a builder's own reading of the engine.
7. Risk: the finisher's final state may move beats, copy or track lengths. B1's parity reference is
   scratchpad/lab/cinematic/final/, and this plan's Act I list applies on top of it.
8. Risk: hover precedence between act lighting and tracing, and focus reveal across long jumps, are the likeliest
   sources of jank; B1's acceptance tests both explicitly.

---

## Appendix A. The film's numbers, recomputed for this plan

Sources: %TEMP%/codeverse-structure-2.json (Katedrala 0.1.0, IR schema 1.0.0, CodeVerse 6b942bc) and
site/public/data/codeverse-graph.json; scripts in scratchpad/lab/director2/ (verify.cjs, reach.cjs, groups.cjs,
syms.cjs, crown.cjs).

| Fact | Value |
|---|---|
| Files listed / analyzed / symbols / relationships | 644 / 594 / 3,766 / 14,233 |
| Edge kinds | calls 4,866; uses 3,459; references-type 2,964; imports 2,616; instantiates 199; re-exports 43; depends-on-package 39; extends 20; reads-configuration 16; implements 11 (the last six: 328) |
| repository.stats | unresolvedImports 0; unresolvedReferences 155; untypedReferences 2,055; externals 59; directories 84 |
| IR entryPoints | 4 (all scripts/sync-grammars.mjs, from package.json scripts) |
| Graph JSON | 587 files: 404 source, 183 test; 1,369 runtime source dependencies; 91 foundations; 31 top files; 1 isolated; levels 0 to 15 |
| Source folders | 404 source files, all under src/: 13 folders plus 1 file at src/'s root |
| analysis-service.ts | 369 lines, 13 symbols, level 9; createAnalysisService lines 141 to 369 |
| cache-key.ts | 51 lines, 4 symbols, level 1; stableStringify 19 to 27 (not exported), limitsHash 30 to 38, graphCacheKey 40 to 46, latestGraphPointerKey 49 to 51 |
| Relationships between them | imports at 25:1 (import-declaration, relative-path); calls graphCacheKey at 219:17, 273:19; calls latestGraphPointerKey at 164:37, 189:9, 190:9, 358:43 (call-expression, import-binding); 7 observations |
| REAL_EDGE | the document's edge:68b8718fedaa1a19 deep-equals lib/site.ts REAL_EDGE |
| types.ts | foundation, 471 lines; 48 direct runtime dependents; runtime reach 147 = 48 + 78 + 17 + 4 (cumulative 48, 126, 143, 147); with type-only dependencies 265 source files; with tests 409 files |
| Crown path | src/app/page.tsx, landing-page.tsx, features.tsx, feature-mockups.tsx, src/graph/model/types.ts (shortest, ties by path) |
| Crown | src/app/page.tsx, level 15; depends directly on 1 file; stands on 137 files, 40 of them foundations |
| cn.ts | runtime reach 88 (63 direct), 90 with type-only, 113 with tests |
| registry.ts | runtime reach 107 (27 direct), 146 with type-only, 248 with tests |

## Appendix B. Measurements behind the budgets

site/out (built 2026-10-08 00:26) served locally with scripts/serve.mjs, Edge headless with default arguments
(Intel UHD through ANGLE D3D11), 1440x900, network log per mode (scratchpad/shots/director2/net.mjs). Sizes are gzip.

| Route and mode | data-kfilm | FCP | kfilm:first-frame | JS and data fetched |
|---|---|---|---|---|
| /lab/cinematic/, film | film | 420 ms | 758 ms | 355.0 KB: framework 133.2, island 1.2, director 11.9, three.js 132.7, stage 13.3, gsap 27.5, ScrollTrigger 17.5, graph JSON 17.2 |
| /lab/cinematic/, reduced motion | still | 676 ms | 919 ms (WebGL still frame) | 309.7 KB: three.js and the stage still downloaded, GSAP not |
| /lab/cinematic/, --disable-webgl --disable-3d-apis | still | 496 ms | not marked (2D path) | 357.0 KB: three.js, the stage and GSAP downloaded although no context can be made |
| /, any mode | (none) | 504 to 824 ms | | 159.4 KB: framework 133.2, sections 25.0, small chunks 1.2 |

Other baselines: main page HTML 304.0 KB raw / 40.2 KB gzip; page height 15,158 px at 1440 and 21,054 px at 390;
first WebGL 2 context 33 ms warm, about 220 ms on a cold GPU process, about 1.1 s under SwiftShader.

---

## User decisions (confirmed 2026-10-08)

1. Hero actions: "Explore Katedrala" plays the film (the navbar keeps "Get started").
2. Act III: the change wave runs on the real CodeVerse structure with the page's computed counts, the whole act marked
   Planned for v1 with a scope line saying what is computed and how.
3. The abandoned physical and drawing prototypes are deleted from the site (a temporary copy goes to
   scratchpad/lab/archive/).
