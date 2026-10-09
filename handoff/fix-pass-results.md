# Fix pass results

## Integration
Integration is done and every check passes except the design detector on the full scope. Its one warning is in the cinematic prototype, which the cinematic workflow is editing right now, so I left it alone. The first integrator attempt had already done the cross-fixer work before the pause. I reviewed it against the four fixer reports, kept all of it, and changed one line this session.

**What I changed**
- This session, in `site/components/sections/OpenSource.tsx`: the heading "The road to v1" now ends with a period, like the other statement subheadings on the page (content's noticed item).
- I also added a touch-emulated 390 px pass to the axe script.
- Kept from the first attempt, re-checked:
  - The phone menu moved into a new `site/components/site/MenuDisclosure.tsx`, so `Navbar.tsx` is a server component again.
  - `TermBar.tsx` renamed to `components/ui/TermLedger.tsx`, imports updated.
  - One `.footnote` style in `base.css` for notes and captions across all sections (replaces `.measure`).
  - The explorer re-fits instantly on resize; arrow keys between commands no longer replay the terminal print.
  - Launch gate added to `site/README.md`, with a new `site/scripts/check-links.mjs`.
  - Status vocabulary fixed in `site/PRODUCT.md`.

**"Needs other owner" items**
- **Impact `minLabelPx`:** nothing needed. The member drawing only shows from 640 px; phones get the module drawing at 12 px.
- **Gravity nested `role="img"`:** already resolved; no nested images anywhere on the page.
- **`.plan-bay rect` rule must stay:** it is present in `explorer.css`.
- **Pipeline fan-in row (claims/C3):** present; the Explain card lists all four terms, and they add up to the score.
- **Launch-gate note:** done.
- **EntropyStage "GAP" error:** it only happened mid-edit; `GAP` is declared before use and the build shows no page errors.

**Checks**
1. **Type-check:** `pnpm exec tsc --noEmit` exits 0.
2. **Build:** `pnpm build` succeeds (`/`, `/_not-found`, `/icon.svg`, `/lab/cinematic`, `/lab/drawing`, `/lab/physical`). I did not stop the dev server on port 3100: I didn't start it, the cinematic workflow uses it, and the build didn't need it stopped. It still answers 200.
3. **Captures:** `capture.mjs` rewrote all 32 captures: desktop full page 1440×15158, mobile 390×20898, no console errors or page errors.
4. **Accessibility:** `axe.mjs` reports 0 violations at 1440, 390, and 390 with touch, both as loaded and with every disclosure open. The only "needs review" items are SVG text, haloed labels and arrow glyphs.
5. **Design detector:**
   - Landing-page files only: `[]`.
   - Full `app components lib`: one warning, bounce-easing in `site/components/lab/cinematic/cinematic.module.css:574` (the `--k-spring` damped spring). The line moved from 551 during this session, so the cinematic workflow is actively editing that file, and the spring is part of the prototype the user approved. That needs the cinematic owner.
6. **Copy grep:** 1,088 visible strings across every state at 1440 and 390, plus the sources and `out/index.html`: 0 em-dashes, 0 en-dashes used as dashes, 0 "in development", 0 "in public". No "joint" in copy, no number of 1,000 or more without a separator, and both "component" uses are the physical-unit sense.
7. **Further checks:**
   - Horizontal overflow is 0 at nine widths from 320 to 1920.
   - Drawing text is at least 11.0 px on screen at every width.
   - Every Tab stop shows a 2 px load-blue focus ring: 44 at 1440, 39 at 390.
   - Forced colors (dark and light) and reduced motion both look right.

**New captures** are in `C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/.impeccable/review/`:
- `desktop.png` and `mobile.png` (full pages)
- `desktop-first-viewport.png` and `mobile-first-viewport.png`
- `desktop-<id>.png` and `mobile-<id>.png` for top, how-it-works, architecture, gravity, entropy, impact, rules, evidence, history, developers, open-source, ecosystem, get-started and footer

**Noticed, not fixed**
- **Ecosystem hover:** pointing at a tool turns its 1.5 px column line load blue. It reads as the tool's load path, the same preview the hero uses, but a strict reading of D6's no-coloured-side-borders rule could flag it. Worth a look in the resolution check.
- **Capture harness:** `capture.mjs` doesn't emulate touch on mobile, so `mobile-architecture.png` shows the mouse hint; real phones show the touch hint.
- **Small targets on phones:**
  - In the explorer's Members view, member targets are 26 px tall (the 24 px minimum is met; the default Modules view is 44 px).
  - The logo link is 194×43.
- **Outside the landing page:**
  - `site/scripts/build-codeverse-graph.mjs` (redesign data script) is not prettier-formatted.
  - `out/` includes the `/lab` prototypes, which the plan deletes before shipping.

**Scripts** are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/integrator/`: `axe.mjs`, `copygrep2.mjs`, `overflow.mjs`, `focuswalk.mjs`, `svgtext.mjs`, `targets2.mjs`, `roles.mjs`, `forced.mjs`. The forced-colors and reduced-motion captures are in its `forced/` and `reduced/` folders.

## Resolution check: claims and copy
# Resolution check: claims-audit and copy-edit (CONFIRMED findings)

41 of the 44 CONFIRMED findings are resolved. Two are only partly resolved: claims/C15 (the README "Get started" section is not published yet) and copy/C20 (the hero lede now reads as if it describes the languages). The fixes also introduced one small new defect in a screen-reader description.

**How I checked:** I read the current source and the diff against HEAD. On the live dev server (localhost:3100) I extracted every visible string, aria-label, `<desc>` and sr-only text at 1440 px with reduced motion, plus every interactive state:
- 16 hero cards
- 5 Gravity choices
- 6 Entropy steps
- 15 Impact targets
- 5 terminal tabs
- 16 explorer members and 8 modules

I also ran the hero at 390 px with a real touch tap, measured lede line counts, and checked the GitHub links over the network. A scan of all rendered text found:
- no em or en dashes
- no "in development", "in public", "joint" or "external packages"
- no British spellings
- every number of 1,000 or more has a thousands separator (only citation years are unseparated)

Type-check (`tsc --noEmit`) exits 0, and the live run had no page errors.

| id | state | evidence (file: string) | remaining fix |
|---|---|---|---|
| claims/A1 | resolved | **OpenSource.tsx:** "Katedrala is MIT licensed. Its engine, document contract, design decisions and roadmap all live in the repository." **FinalCta.tsx:** "Katedrala is open source and being built toward v1." No "in public" anywhere in rendered text. site/README.md has a "Launch gate" section and site/scripts/check-links.mjs exists. github.com/tedddby/Katedrala now answers 200; origin/main (c156e96) has milestones 1–4 Done. Every repository link target answers 200. | See claims/C15: the link checker ignores `#fragment`. |
| claims/A2 | resolved | **Developers.tsx:** "The document format is specified as JSON Schema, generated from its TypeScript types and versioned in the repository. Today, `analyzeStructure` returns the document's structural sections." (Generation confirmed: scripts/generate-schema.mjs uses ts-json-schema-generator.) **Ecosystem.tsx:** "Build on the versioned document format and its JSON Schema." and "Versioned JSON: the structure today, the full architecture in v1." | none |
| claims/B1 | resolved | **layout.tsx** (rendered meta): "…maps the dependency structure of TypeScript and JavaScript code, with the file and line behind every relationship. Boundaries, structural risk and change impact are planned for v1." | none |
| claims/B2 | resolved (required part) | **Pipeline.tsx** Link card: "Imports resolve through tsconfig paths, workspaces and package exports; references bind to their declarations. What cannot be bound is counted, never guessed." | Optional, not done: unresolved and untyped reference rows in the analyze transcript. |
| claims/B3 | resolved | **commands.ts** analyze renders "externals 59 / npm packages 39 / Node.js built-ins 8 / environment variables 12", read from `CODEVERSE_ANALYSIS.packages`, `.builtins` and `.environmentVariables`. | none |
| claims/B4 | resolved | **Architecture.tsx** aside: "Typed graph, available today" and "Module inference, planned for v1". Lede: "Katedrala links files and symbols into one typed graph today; inferring the modules within it is planned for v1." | none |
| claims/B5 | resolved | **site.ts:** `planned: "Planned for v1"`. **Gravity/Entropy** asides: "Katedrala heuristic, planned for v1". **Hero:** "Gravity: draft method, planned for v1". **Evidence:** "…draft Katedrala heuristic, planned for v1." **OpenSource:** "Everything this page marks as planned for v1 is on this list." PRODUCT.md updated. | none |
| claims/B6 | resolved | **GravityStage.tsx** footnote: "…log shares, ln(1 + x) / ln(1 + max), against the most a system of 16 members allows: 15 for reach and fan-in, 210 for brokerage. Spread saturates as x / (x + 3). …only slightly as the system grows." This matches the code in metrics.ts. | none |
| claims/B7 | resolved | **Gravity.tsx:** "The weights are design choices and will be documented with the method in milestone 6." | none |
| claims/C2 | resolved | **system.ts:** `RULE_CHANGE` and `checkRules`. **Rules.tsx** and the validate transcript are computed: "1 error, 2 rules checked", exit 1, the file shown without the invented ":7". **Developers** note: "…with one hypothetical import added for validate, from OrderController to OrderRepository." **Rules** footnote: "…the report layout is a preview." | none |
| claims/C3 | resolved | `formatParts` is used in EntropyStage, the health transcript, GravityStage, Evidence and Pipeline. Live, all six Entropy states add up (0.22, 0.45, 0.52, 0.57, 0.60, 0.63). Health: +0.00 +0.00 +0.12 +0.10 = 0.22. Explain card: +0.28 +0.10 +0.13 +0.07 = 0.58. All five Gravity choices add up. | none |
| claims/C5 | resolved | **Pipeline.tsx** lede: "Katedrala is designed as five passes. Each adds to the document and never rewrites what an earlier pass produced." Infer: "Components will be derived from directories and packages; modules and layers will be inferred, each with a confidence and its evidence." Doc comment updated. | none |
| claims/C8 | resolved | **Gravity.tsx** lede ends "…from the dependency graph and module boundaries." Footnote: "Three of its four terms… fan-in is afferent coupling (Martin 1994)… Cross-module spread is Katedrala's own." | none |
| claims/C9 | resolved | **entropy.ts:** "1 of 17 cross-module dependencies runs against the best one-way order." and "A module's dependencies spread over 2.9 modules on average, its own included." Entropy lede now lists "…scattered coupling and propagation." | none |
| claims/C10 | resolved | **history.ts:** v4 title "Against the load path". v1 change is computed: "Gateway, Auth, Users and Platform". | none |
| claims/C11 | resolved | **Evidence.tsx:** "Its betweenness is 13.2: summed over pairs of other members, the share of each pair's shortest dependency paths that pass through it." **GravityStage:** "betweenness 13.2". | none |
| claims/C12 | resolved | **ImpactStage** count label "HTTP handlers". **commands.ts:** "HTTP handlers: ApiGateway, CheckoutController, OrderController". | none |
| claims/C14 | resolved | **site.ts:** milestone name "Metrics" (the roadmap's exact name, per D2). Aria-label: "4 milestones done, 1 in progress, 10 planned". | none |
| claims/C15 | partly resolved | README.md (working tree) has "## Get started", and site.ts `readme` points to `${REPOSITORY_URL}#get-started`. But README.md is uncommitted. The public README on main only has the anchors katedrala, why, how-it-works, development and license. So the nav "Get started" button, the mobile-menu link, the final "Get started" button and the Developers link "from a clone of the repository" all land on a README with no usage section. check-links.mjs drops `#…` from URLs, so the launch gate still passes. | The user commits README.md's Get started section and pushes main before deploying (the charter says never push). In site/scripts/check-links.mjs, for each repository link with a fragment, fetch `https://raw.githubusercontent.com/tedddby/Katedrala/main/README.md` and fail unless a heading's slug equals the fragment (for `#get-started`, require `/^## Get started$/m`). |
| copy/C1 | resolved | Same as claims/B3. | none |
| copy/C2 | resolved | **TermRow** renders "Reach 13 of 15 rest on it → 0.95 × 0.40 = 0.38", "Fan-in 4 direct → 0.58 × 0.20 = 0.12" and "Cross-module spread 4 other modules → 0.57 × 0.25 = 0.14". Same "normalized × weight" column head as Entropy. | none |
| copy/C3 | resolved | Same as claims/C11. | none |
| copy/C4 | resolved | **entropy.ts:** "A module's dependencies spread over 2.9 modules on average, its own included." Same text in the panel and the health transcript. | none |
| copy/C5 | resolved | "Cross-module dependencies all flow one way." / "1 of 17 … runs" / "2 of 19 … run". | none |
| copy/C6 | resolved | Aria-label: "Load drawing of the demonstration system: 1 member rests on CheckoutController; directly: ApiGateway." | none |
| copy/C7 | resolved | Same as claims/C14. | none |
| copy/C14 | resolved | **Ecosystem.tsx:** "Katedrala is an engine, not a visualization product: it produces one versioned document for other tools to build on." Two lines at 1440. | none |
| copy/C15 | resolved | Same as claims/B7. | none |
| copy/C16 | resolved | Same as claims/B2. | none |
| copy/C17 | resolved | **MemberCard.tsx** `ModuleIdleCard` at 390: "Platform / Carries the most load: all 7 other modules rest on it. / … / Select any module to light the load path it carries." **LoadDrawing:** a click now always selects, and touch never previews. Live 390 tap: aria-checked becomes true and the module card shows. Desktop hover then click selects, and a second click keeps the selection. | none |
| copy/C18 | resolved | Same as claims/B4. | none |
| copy/C19 | resolved | **OpenSource.tsx:** "Built to extend: Languages plug in through a typed adapter contract. TypeScript and JavaScript come first." | none |
| copy/C20 | partly resolved (wording got worse) | **Hero.tsx:** "Katedrala reconstructs the architecture of TypeScript and JavaScript, with evidence for every&nbsp;dependency&nbsp;it&nbsp;finds." The widow is gone and it is 2 lines at 1440. But "code" was dropped, so it reads as the architecture of the languages, against the verified fix ("keep the words"). Measured: every variant with "the architecture of/inside … TypeScript and JavaScript code" is 3 lines at 1440. | Lede: "Katedrala maps TypeScript and JavaScript code, with evidence for every&nbsp;dependency&nbsp;it&nbsp;finds." Measured 2 lines at 1440 (last line "evidence for every dependency it finds."), 2 at 768, 3 at 1024 and 390, with no widow. It is also in the present tense only for what works today (D1). |
| copy/C22 | resolved | Same as the Pipeline lede in claims/C5. | none |
| copy/C23 | resolved | Same as the Infer text in claims/C5. | none |
| copy/C24 | resolved | "neighbourhood" is gone (no British spellings on the page). The footnote now states the system-size effect. | none |
| copy/C25 | resolved | **GravityStage** `rawLabel`: "betweenness 13.2". | none |
| copy/C29 | resolved | **ImpactStage:** "PaymentService is in the Payments module. Paths are the shortest dependency chains, with ties broken by name, so every run gives the same answer." | none |
| copy/C36 | resolved | **history.ts** (computed): "Gateway, Auth, Users and Platform", "+ Payments module, 3 members", "+ Checkout, Orders and Billing modules, 7 members". | none |
| copy/C40 | resolved (superseded by D2) | Milestone name is "Metrics". | none |
| copy/C41 | resolved | docs/ROADMAP.md (HEAD and origin/main): 1–4 Done, 13 In progress, matching `MILESTONES`. Renders "4 of 15 milestones done, 1 in progress." The zero case is guarded in both the text and the aria-label. | none |
| copy/C42 | resolved | **Ecosystem.tsx:** "parse, link, infer, analyze, explain". | none |
| copy/C49 | resolved | **ArchitectureExplorer:** "calls AuthService", "instantiates StripeClient", "accesses data in Database". | none |
| copy/C51 | resolved | **system.ts:** role "HTTP controller" (twice) and Database role "data model". `HTTP_ROLES` in impact.ts updated to match. | none |
| copy/C54 | resolved | Same as claims/B1. | none |
| copy/C55 | resolved | **Developers.tsx:** "The same files, configuration and Katedrala version produce the same document, byte for byte." | none |

## New problems the fixes introduced
1. **Hero lede wording:** see copy/C20 above.
2. **Lowercase sentence start in a screen-reader description.** The new module `detail` in components/hero/HeroDrawing.tsx:63 (the `<desc>` read after each joint of the phone drawing) produces "Members: EventBus, Database. all 7 other modules rest on it." because `shareOf` returns "all 7 other modules".
   - Fix: ``detail: `Members: ${listed(m.members)}. Carries ${shareOf(resting, OTHER_MODULES, "modules")}.` ``, adding `listed` from `@/lib/text`. It renders "Members: EventBus and Database. Carries all 7 other modules."
   - Optional: use `listed()` in the member detail at :46 too, so it matches the explorer's descriptions.
3. **Minor repetition in the Impact lede** (Impact.tsx): "trace dependency paths out from a change … path by path". Optional fix: "Katedrala will trace the dependency paths out from a change to estimate its structural blast radius."

## Files changed
None (review only). My scripts and outputs are in scratchpad/shots/resolution-check-claims-copy/: extract.mjs, lede-fit.mjs, lede-fit2.mjs, hover-click.mjs, extracted-1440.json and extracted-390.json.

## Needs other owner
- Committing README.md's "Get started" section and pushing main is the user's action.
- site/scripts/check-links.mjs needs the fragment check (whoever owns site/scripts).
- Hero.tsx (lede) and HeroDrawing.tsx (desc) go to the hero owner.

## Noticed, not caused by the fixes
- The Ecosystem card "CI pipelines: Fail a build when a change breaks a rule." is marked Planned for v1 but written as an imperative. The planned steps in the same section now use "will". Suggested: "Will fail a build when a change breaks a rule."
- The footer link "Architecture document" goes to docs/ARCHITECTURE.md, while the Ecosystem section uses "Architecture document" for the JSON output. Rename the footer link to "Architecture" or "Design and decisions".
- The analyze transcript shows only "unresolved imports 0", while the Link card now says unresolved references are counted. Optional: add unresolved and untyped reference counts to `CODEVERSE_ANALYSIS` and the transcript.
- .impeccable/surfaces/app-page-tsx.md and .impeccable/decision/brief-body.md still say "in development for v1". These are design documents, not page copy.
- D3 assumes the repository is private, but it now answers 200. The page claims nothing "in public", so no copy change is needed, and the title "Read every line of it." is now literally true.

## Resolution check: accessibility and visual
**Resolution check: accessibility and visual-responsive audits.** I tested the built static export `site/out` (built 00:47, newer than every landing-page source), served in-process and driven with headless Edge (playwright-core) at 320, 390, 430, 480, 560, 600, 639, 640, 700, 767, 768, 834, 1023, 1024, 1180, 1279, 1280, 1366, 1440 and 1920 px. I edited no repository files.

**Result:** 54 of 55 confirmed findings are resolved and one is partly resolved (a11y/A15). None is unresolved. The fixes introduced two minor regressions, R1 and R2, listed after the tables.

**Page-wide checks**
- **axe:** 0 violations at 1440 and 390 with the table open, at 390 with the menu open, and at 1024 and 320. The only items left for review are color-contrast checks axe cannot decide (SVG text, masked code).
- **Layout:** no reflow overflow at 320 or 640x400. The text-spacing override clips nothing at 390 or 1440.
- **Console:** no errors at 390, 768, 1024 or 1440.
- **Tab stops:** 44 at 1440 (was 93), 46 at 1024, 41 at 768, 39 at 390.
- **Keyboard:** every interactive drawing and control works by keyboard alone at 390, 768 and 1440: hero, explorer in both modes, Gravity radios, Entropy commits, Impact select, command tabs, skip link.

### accessibility-audit

| id | state | evidence | remaining fix |
|---|---|---|---|
| A1 | resolved | **1440 mouse:** hovering PaymentService previews the card and leaves aria-checked unchanged. Click selects (aria-checked=true). A second click keeps the selection. A click on blank paper returns to rest. **390 touch:** one tap on Payments selects it and fills the card; one tap on Orders switches. **820 touch:** one tap selects on the member drawing. | — |
| A2 | resolved | Tab lands on one member and does not select it. Enter and Space select; Space leaves scrollY at 0. Escape clears the selection, focus stays on the member and the ring stays visible. aria-pressed is replaced by radio/aria-checked, which follows selection only, never hover or focus. | — |
| A3 | resolved | `scroll-padding-top: 5rem` is in place. Shift+Tab walks at 1440, 1024 and 390, and forward walks at 1440, 768 and 390: no focused element sits under the opaque nav. | — |
| A4 | resolved | At 1.95× zoom, Tab into the plan pans it to show ApiGateway (translate y −342 → −77). ArrowRight through all 16 members keeps 16/16 joints and labels inside the sheet. The 390 Members view, magnified 1.72×, also keeps 16/16 inside. | — |
| A5 | resolved | radiogroup "Member to measure" with roving tabindex. Arrows move focus and selection together and wrap. Tab leaves to Entropy. | — |
| A6 | resolved | **Hero:** no live region; the card facts are read from a `<desc>` as the member's description. **Gravity and Impact:** one sr-only atomic status sentence each, e.g. "PaymentService: gravity 0.58, 6 of 15 members rest on it." and "Changing Database affects 13 members in 7 modules, including 3 HTTP handlers." **Entropy:** the score is atomic: "0.63 high entropy". | — |
| A7 | resolved | At 390, 768 and 1023 there is a "Primary" navigation landmark. Tapping a link sets the hash and closes the menu. A tap outside closes it. Escape closes it and returns focus to Menu. Tabbing out closes it. | — |
| A8 | resolved | At +5 the aria-label says "…Auth, Billing, Orders, Payments and Users are tangled in a cycle.", and the caption reads "In a cycle: …". | — |
| A9 | resolved | Measured contrast after opacity: <br>• Bay outline, explorer and Rules: 3.67:1 <br>• Entropy base edge: 4.11:1 <br>• History old edge: 4.11:1 <br>• Kind toggle: pressed solid border 5.79:1, unpressed dashed 1.66:1 | — |
| A10 | resolved | At 390 with the table open the scroller is tabIndex 0, role=region, named "Graph as a table" (640/358). At 1440 it is not a tab stop. | — |
| A11 | resolved | Under forced colors, the checked segment, Gravity choice and commit compute Highlight background with HighlightText text, including the mono spans. The captures show each selection marked. | — |
| A12 | resolved | No duplicate ids at any width. The hatched ground shows under Platform at 390. | — |
| A13 | resolved | All SVG text renders at 11 px or more from 320 to 1920 (minimum per drawing: hero 11, Impact 12, Rules 11.2, explorer 11, Gravity 11). Gravity on phones is an HTML list at 14 px. | — |
| A14 | resolved | The plan now has its own pinch handler. A two-finger CDP pinch at 390 zooms the plan from 1 to 3.2 while page scale stays 1. A vertical swipe at fit still scrolls the page 740 px. | — |
| A15 | partly resolved | Hero and explorer are one Tab stop each, with arrow keys between members. Pipeline `<li>`s are no longer focusable. CodeBlock `<pre>` and the history `<ol>` take a stop only while they scroll. **Left over:** the Developers terminal `<pre>` (CommandShowcase.tsx, `tabIndex={0}`) is a stop at every width, with no role or name, even where nothing scrolls (all transcripts 705/705 at 768). | In CommandShowcase.tsx, make the terminal `<pre>` focusable only while it overflows (the existing overflow effect can set a `scrolls` state, as CodeBlock does). When focusable, give it `role="region"` and `aria-label={`${command.id} output`}`. If an APG panel stop is still wanted, put `tabIndex={0}` on the `role="tabpanel"` div, which is already named by its tab. |
| B1 | resolved | Hero ring: 2 px load blue, non-scaling, 4.5 px outside the joint (r 15 vs joint 10). Explorer ring: 2 px load blue. Both become Highlight under forced colors. | — |
| B2 | resolved | While the plan has keyboard focus the visible hint reads "Arrow keys select members, + and − zoom, 0 fits, Escape clears." ("modules" in Modules view). aria-describedby points to it. | — |
| B3 | resolved | Buttons are named "Copy katedrala.config.yaml" and so on. A role=status reads "… copied." On a rejected clipboard write the button shows "Copy failed" and the status reads "Copy failed. Select the code to copy it." Figures are named by their label. | — |
| B4 | resolved | Non-interactive drawings are role=img with full descriptions. The accessibility-tree scan finds no empty named containers and no unnamed controls at 1440 or 390. | — |
| B5 | resolved | Below 1024 the tabs wrap instead of scrolling: 3+2 rows at 390, 2+2+1 at 320, one row at 768 (scrollWidth equals clientWidth). aria-orientation is horizontal below lg. Arrows, Home and End work. | — |
| B6 | resolved | Panning is bounded. At 1440, zoomed, a far drag stops at the plan edge, translate(−568, −408) at scale 1.568. At fit, drags and swipes don't move it. At 390, zoomed, a swipe stops at −2200, the plan's edge at 3.2×. | — |
| B7 | resolved | Zoom in is aria-disabled at 3.2×; Zoom out and Fit are aria-disabled at fit, and focus is kept. Every kind toggle can be turned off. Scale and commits are radiogroups with aria-checked and arrow keys. | — |
| B8 | resolved | Footer link is "Architecture document". The CTAs read "Get started on GitHub". No visible link name leads to two destinations. | — |
| B9 | resolved | The '$' prompt is rgb(139, 142, 146), ink-faint. | — |
| B10 | resolved | "4 milestones done, 1 in progress, 10 planned". | — |
| B11 | resolved | The text alternative lists members by distance: "…13 members rest on Database; directly: OrderRepository, …; 4 steps away: CheckoutController." | — |
| B12 | resolved | With JS held back 2 s: under reduced motion the drawing is visible from first paint. With motion allowed and hydration at 4.1 s, after the 3.5 s failsafe, the drawing goes straight to done with no scatter. | — |

### visual-responsive-audit

| id | state | evidence | remaining fix |
|---|---|---|---|
| C1 | resolved | The beam runs horizontally only from 1280; below that it is a vertical schedule. Stage overflow is 0 px at every width from 390 to 1440, with 24 px gaps between stages at 1280+. | — |
| M1 | resolved | The hero stacks below lg. Labels: 11 px at 320, 12.7 at 390, 17 at 639, 11–13.1 from 640 to 1023, 11–13 from 1024 to 1440. Level labels are 11 px or more everywhere. At 768 the headline is one line. | — |
| M2 | resolved | Selection behaves as in A1. At 390 the phone card sits directly under the drawing; after a tap its top is at 765 in the 844 viewport. | — |
| M3 | resolved | Hovering or tapping every member moves neither the next section nor the card: 0 px at 390, 640, 768, 834, 1024, 1280, 1366, 1440 and 1920. | — |
| M4 | resolved | At 390, 768 and 1440 no module edge passes within 33.3 plan units of another joint. No edge crosses a name, no edges overlap, and no count sits on a name. | — |
| M5 | resolved | 640 opens in Modules (12 px). 700–1023 open in Members (11–11.7 px), 1024–1279 at 11 px, 1440 at 12.3 px. The toolbar is one row at 1024. | — |
| M6 | resolved (see R2) | Below 640 Impact draws the module version (12–12.7 px at 320 and 390); from 640 the member drawing (11 px or more). | see R2 |
| M7 | resolved (see R1) | Below 640 a portrait redraw, 11.8–12.7 px at 320 and 13.8–16 px at 390. Landscape is 11 px or more from 640 to 1440. | see R1 |
| M8 | resolved | Below 640 the tributary is an HTML list by load level (8 levels, 14 px names). From 640 the drawing labels are 11–16 px. | — |
| M9 | resolved | Same as A7. | — |
| M10 | resolved | At 390 and 768 the history strip runs to the screen edges. Scrolled to the end, the last card ends at 374 and 738. The command tabs now wrap instead of scrolling. | — |
| M11 | resolved | Joints and edges are identical at 30, 60, 160 and 400 ms after switching members. | — |
| N1 | resolved | The UserRepository label clears the SessionStore joint by 16.6–37.9 px at 640–1440. No labels overlap. | — |
| N2 | resolved | With Database selected, its label (y 679–693) sits below the ground line (662) and the hatch (662–672). | — |
| N3 | resolved | 3 rows at 390; 2+1 at 640 and 1024 with a divider between rows and no doubled edge; one row at 768 and 1280+. | — |
| N4 | resolved | The three counts line up: 1090/1090/1090 at 320 and 1093 ×3 at 390. | — |
| N6 | resolved | Inline code is 12.25 px inside 14 px text. | — |
| N7 | resolved | Shared `.footnote` style (13 px, 60ch): about 79–80 characters per line at 768 and 1440, down from 100–140. | optional: Developers `mt-4` and Open source `mt-5` are the only margin outliers |
| N8 | resolved | The Entropy drawing is capped at 30rem (447 px wide at 1440, 14–15 px labels). The commit list moves 0 px over +1 to +5 at 320 and 390. | — |
| N9 | resolved | Code block and violation panel bottoms match: 895/895 at 1024, 1038/1038 at 1280, 1072/1072 at 1440. | — |
| N11 | resolved | The kind toggles show only in Members view. The Modules toolbar is 358×46 at 390 and 288×102 at 320 (was 173 px tall). | — |
| N12 | resolved | At 390 with a coarse pointer, every primary control and every drawing member is a 44 px target or larger. Only inline text links, which are exempt, are under 24 px. | — |
| N13 | resolved | Every overflowing code block and transcript at 390 fades at its cut edge; the fade is dropped under keyboard focus. | — |
| N14 | resolved | Below 1024 only the last tool keeps its joint. | — |
| N15 | resolved | At 1x the three marks are crisp and distinct: open square, corner brackets, filled square. | — |
| N16 | resolved | The Architecture section shows "Typed graph, available today" and "Module inference, planned for v1". | — |
| N17 | resolved | The Evidence check marks are ink-faint, rgb(139, 142, 146). | — |
| N18 | resolved | Ctrl+wheel zoom applies instantly (rendered scale equals target) and scales with deltaY. A held "+" is instant. Page zoom stays 1. | — |

### Regressions the fixes introduced

**R1 (minor, from the M7 fix).** The Rules portrait drawing fills the full width up to 639 px. Its labels then outgrow the 18 px lede.

| width | member label | bay label | drawing height |
|---|---|---|---|
| 430 | 17.9 px | 15.4 px | 466 px |
| 560 | 23.6 px | 20.4 px | 616 px |
| 600 | 25.4 px | 21.9 px | 663 px |
| 639 | 27.2 px | 23.4 px | 708 px |

The capture is `out/sec-600-rules.png`. **Fix:** in `Rules.tsx`, add `mx-auto max-w-[21rem]` to the `violation-portrait` svg, so the type stays at about 16 px or less, as at 390.

**R2 (minor, from the M6 fix).** The Impact phone module drawing has no width cap, unlike the hero's. Its labels reach 18.2 px at 560, 19.5 at 600 and 20.8 at 639, against the 18 px lede (`out/sec-600-impact.png`). **Fix:** in `ImpactStage.tsx`, change `<div className="sm:hidden">` to `<div className="max-w-[30rem] sm:hidden">`, as the hero does.

### Also noticed, not caused by these fixes
- At 320 with the WCAG text-spacing override, the fixed header grows to 342 px and the Menu button is cut 6 px at the right edge. It fits with normal spacing.
- In the explorer's Members view, edges still run through member names (ApiGateway, CheckoutService). Labels sit under the joints where edges leave; HEAD had the same.

Scripts (`lib.mjs`, `tabwalk.mjs`, `hero.mjs`, `svgtext.mjs`, `explorer.mjs`, `stages.mjs`, `global.mjs` and others) and captures are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/resolution-check-a11y-visual/` (captures under `out/`).

## Fixer reports
### hero-nav
Report for **hero-nav**. All 22 assigned findings are fixed. I checked them on the live dev server with Playwright/Edge at 320–1920 px, using touch, mouse, keyboard, reduced motion and forced colors. `tsc --noEmit` is clean, prettier has been run on my files, and axe reports 0 violations at 1440 and 390. Scripts and captures are in `scratchpad/shots/hero-nav/` (`out/` holds the captures).

## Findings

| Id | Status | What changed / how verified |
|---|---|---|
| finish/#2 | fixed | At rest, `LoadDrawing` tests the heaviest unit through a new `resting` prop. The desktop drawing lights Database's path (13 carried members, 21 blue edges); the phone drawing lights Platform's (7 members, 15 edges). The path lights when the settle ends. I added one thing beyond the brief: at rest, unrelated members (StripeClient, EventBus) are no longer dimmed, so their labels stay readable. |
| finish/#5 | fixed | The label above the heading is gone. The card now reads: name, then "Carries the most load: 13 of 15 members rest on it." (phones: "all 7 other modules rest on it"), then Module/Members and "Depended on by" rows, then the hint at the foot. |
| finish/#8 | fixed | Stroke width is now `0.8 + 5·load/max`, about 1.2 to 5.8 units, so the edges into Database read clearly heaviest. Checked visually in the hero, Impact and Gravity drawings. |
| claims/B1, copy/C54 | fixed | Meta description: "...maps the dependency structure of TypeScript and JavaScript code, with the file and line behind every relationship. Boundaries, structural risk and change impact are planned for v1." |
| a11y/A1, visual/M2 | fixed | One tap or click selects and never toggles. Hover previews only for mouse and pen. Clicking the bare sheet returns to rest. Verified at 1440 (mouse), 390 and 820 (touch). The phone card now sits above the title block, so its top is in the 390×844 first viewport. |
| a11y/A2 | fixed | Enter and Space select (the page no longer scrolls), Escape returns to rest and focus stays with its ring. `aria-pressed` is replaced by a radio group with `aria-checked`. |
| a11y/A3 | fixed | `scroll-padding-top: 5rem` in `base.css`. A Shift+Tab walk finds no focused element under the nav (only the nav's own links are up there). |
| a11y/A7, visual/M9 | fixed | The phone menu is inside `<nav aria-label="Primary">`. It closes on link choice, outside press, Escape (focus returns to Menu) and when Tab leaves it. Verified at 390 and 768. |
| a11y/A11 | fixed | Unlayered forced-colors rules for the drawing states (Highlight for the tested member and its path), the focus ring and the open menu. Level lines become dotted. |
| a11y/A12 | fixed | Hatch pattern ids come from `useId`: 5 patterns, all unique, and each drawing fills from its own (hatch now shows on phones). |
| a11y/A15 | fixed | One Tab stop per drawing (roving tabindex starting on the resting member). Left/right step in reading order, up/down climb levels, Home/End jump. Selection follows the arrows. |
| a11y/B1 | fixed | Focused members get a 2 px load-blue ring around the joint, the same width at any drawing size. |
| a11y/B8 | fixed | Footer link renamed "Architecture document". Nav and menu "Get started" links now announce "Get started on GitHub". |
| a11y/B12 | fixed | Hiding the drawing until the settle now applies only when motion is allowed, so reduced-motion users see the lit drawing before hydration. A drawing already revealed by the CSS failsafe is never scattered again. |
| copy/C17 | fixed | The phone card names and lights Platform: "Select any module to light the load path it carries." |
| copy/C20 | fixed | Tail bound with no-break spaces. To also meet D5 I changed "inside TypeScript and JavaScript code" to "of TypeScript and JavaScript", which makes the lede 2 lines at 1440–1920 and keeps "it finds". |
| copy/C51 | fixed (by system.ts owner) | "HTTP controller" and "data model" were already changed in `system.ts`/`impact.ts`; I confirmed the hero card shows them. |
| visual/M1 | fixed | Hero stacks until lg; member drawing from sm; module drawing below sm, capped at 30rem. Drawing text has an 11 px floor (`minLabelPx`). Measured 11–13 px from 320 to 1920 with no label collisions. |
| visual/M3 | fixed | The card slot reserves the tallest card's height and the card fills it. Hovering all 16 members moves nothing (0 px at 640–1920), and tapping all 8 modules moves nothing (0 px at 320–600, after pinning the slot width so long names wrap instead). |
| visual/N1 | fixed | AuthService and SessionStore moved to x=716. I also moved three labels off edges that crossed them: OrderService to the right of its joint; Auth and Users to the left in the module drawing. |
| visual/N3 | fixed | Title block cells now share hairline rules in every wrap state (checked at 390, 1024 and 1440). |
| visual/N12 | fixed | Menu toggle and the small nav button are 44 px tall on touch, footer links are 44 px tall on touch, drawing members get 44 px targets on touch, hero CTAs are 44 px. |

I also fixed two items that were not assigned but sit in my files: non-interactive drawings now use `role="img"` (a11y/B4), and the hero cards are no longer live regions; each member's card facts are read on focus instead (the hero part of a11y/A6).

## Files changed
- `site/components/drawing/LoadDrawing.tsx`
- `site/components/hero/Hero.tsx`, `HeroDrawing.tsx`, `MemberCard.tsx`
- `site/components/site/Navbar.tsx` (now a client component), `Footer.tsx`
- `site/components/ui/Button.tsx`
- `site/app/layout.tsx`
- `site/app/styles/base.css`, `drawing.css`, `nav.css`
- `site/lib/demo/layout.ts`

`LoadDrawing` props are backward compatible; I only added `resting`, `onTestedChange`, `minLabelPx` and `DrawingMember.detail`.

## Needs other owner
- **Impact owner:** `minLabelPx` defaults to 11, so the full member drawing collides below 640 px if it is ever shown there. Your phone module drawing already avoids this; pass `minLabelPx={0}` to opt out.
- **Gravity owner:** your `<div role="img">` wrapper now contains a `LoadDrawing` that is itself `role="img"`. Harmless, but one of the two is redundant.
- **Gravity and Impact owners:** my `layout.ts` changes also move labels in your drawings (OrderService label now right of its joint; Auth and Users labels left in module drawings). I checked both at 1440 and the Impact module drawing at 390.
- **Other owners:** the rest of finish/#8 (hatched ground under the Gravity and Entropy foundations, condensed final CTA headline) is in your files.

## Noticed, not fixed
- The full member drawing still has a few labels touched by edges, kept readable by the label halo: AuthService (the ApiGateway edge; there is no room on its right), OrderRepository (the OrderService→EventBus edge), plus InvoiceService and UserRepository at 1024. Clearing them means repositioning members in `layout.ts`, which would also move the Gravity and Impact drawings.
- The hero card's bottom sits 26–38 px below the title block's at 1440 and wider. Aligning them would need a cramped 20 px gap under the CTAs.
- The meta description is 220 characters; search results show about 160, but the first sentence already carries the available-today claim.
- `Navbar` is now a client component. Moving the menu into its own file would keep the rest server-rendered, but that file is not in my list.

### explorer-pipeline
All 23 assigned findings are fixed. The earlier attempt had done most of the work. I kept it, repaired what was half-done (the module count label, the table region, the resize behaviour), shortened the Link copy, and checked every finding on the live dev server at 320 to 1920 px. Type-check passes and prettier has been run on all six files.

**Findings**
- **claims/B2, copy/C16: fixed.** The Link card now reads "Imports resolve through tsconfig paths, workspaces and package exports; references bind to their declarations. What cannot be bound is counted, never guessed." It is shorter than the earlier wording, so the shared text row is now 5 lines from 1366 px and 6 at 1280 (it was 6 and 7).
- **claims/B4, visual/N16, copy/C18: fixed.** The Architecture section now carries two marks: "Typed graph, available today" (filled square) and "Module inference, planned for v1" (open square). The lede says "Katedrala links files and symbols into one typed graph today; inferring the modules within it is planned for v1." It runs 2 lines at 1440.
- **claims/C5, copy/C22, copy/C23: fixed.** The lede says Katedrala "is designed as five passes. Each adds to the document and never rewrites what an earlier pass produced." Infer says components will be derived and modules and layers will be inferred. Analyze and Explain are in the future tense. The doc comment matches.
- **copy/C49: fixed.** Member details now read "calls AuthService" and "accesses data in Database".
- **a11y/A4: fixed.** A keyboard-focused item pans into view. Walking every item at 1.95× zoom at 1440, 1024 and 390, all stayed inside the sheet.
- **a11y/A9: fixed.** Bay boundaries are ink-faint at 75% opacity (3.68:1). In the explorer they are at least 1 CSS px wide at any size. A kind toggle that is on has a solid border; one that is off has a dashed border and a faded sample line.
- **a11y/A10: fixed.** The table scroller (`TableScroller`, now exported from ArchitectureExplorer.tsx) becomes a focusable region named "Graph as a table" only while it scrolls: at 390 it is a Tab stop, at 1440 it is not. axe found 0 violations in both sections at 1440 and 390, in both modes, with the table open.
- **a11y/A14: fixed with a two-finger pinch handler.** A pinch sent through raw touch events at 390 zooms the plan. A vertical swipe on the unzoomed plan still scrolls the page.
- **a11y/A15: fixed.** The plan is one Tab stop, and arrow keys, Home and End move between members or modules. The section has 9 Tab stops at 1440 (it had 26). The pipeline stages are no longer focusable.
- **a11y/B1: fixed.** Focused members and modules get a 2 px load-blue ring that stays 2 px at any zoom.
- **a11y/B2: fixed.** While the plan has keyboard focus, a visible hint lists the keys; the plan's description points to it.
- **a11y/B6: fixed.** Dragging, pinching, the keys, the wheel and auto-panning cannot push the plan off the sheet. Tested by drag at 1440 and touch swipes at 390.
- **a11y/B7: fixed.** Members/Modules is a radio group with arrow keys. Zoom in, Zoom out and Fit are marked disabled at their limits (they keep focus). The last relationship kind can now be turned off.
- **visual/C1: confirmed and fixed.** The horizontal beam starts at 1280; from 768 to 1279 each pass is one row of three columns. Values wrap instead of overflowing. No overflow or overlap at 17 widths from 320 to 1920.
- **visual/M4: fixed.**
  - No module edge passes within 33 units of another module's joint or within 10 units of any module name. Edges cross at 58° or more, and edges meeting at a joint are at least 27° apart.
  - The "2" count now sits in a break of its own line. Before, it sat on the Checkout→Payments line and read as belonging to it.
  - Member edges bend around joints.
  - Bay names sit in whichever top corner the lines leave clear; at 1440 no line crosses a bay name.
- **visual/M5: fixed.** Member and bay labels render at 11 px at 768, 1024 and 1280, and 12.3 px at 1440. At 640 and below the explorer opens in Modules with 12 px labels.
- **visual/N11: fixed.** The kind toggles appear only in Members mode, as a legend under the plan.
- **visual/N18: fixed.** Wheel zoom, pinch, drag and held keys apply instantly; the buttons and single key presses keep the 280 ms ease-out.

Beyond the findings, I made four other changes:
- Plan targets are now 44 px.
- Forced-colors rules are scoped to the explorer.
- The count label follows the line's state colour.
- Resizing the window now keeps the zoom relative to the fitted plan. Before, going from narrow to wide left the plan stuck magnified.

**Files changed**
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/Architecture.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/ArchitectureExplorer.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/components/sections/Pipeline.tsx
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/lib/demo/plan.ts
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/app/styles/explorer.css
- C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/app/styles/pipeline.css

**Needs other owner**
- Nothing is required. For the rules-evidence.css owner: the Rules drawing shares `.plan-bay rect`, so it also gets the 3.68:1 boundary (A9 intends this). I captured it and it renders correctly.

**Noticed, not fixed**
- In Members view, 6 edges still pass behind other members' names (for example ApiGateway→AuthService behind CheckoutController). The names stay readable because their halos hide the line. Avoiding them would need bends of up to about 90 units, so I left it. At 768 to 1024, two lines also pass behind "PLATFORM"; no layout clears it.
- Dimmed members are at 0.22 opacity, which is low contrast by design and matches the hero's 0.24.
- The plan picks its opening mode from the first width it measures. A brief narrow layout while the dev server reloads CSS could open Modules on desktop; this is dev only.
- Playwright screenshots taller than the viewport in mobile emulation show the mouse hint and a hover ring. The computed styles show the touch hint in reality, so this is a harness artifact.

The test scripts are in C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/shots/explorer-pipeline/ (v/ and v/geo/); captures are in out/ (final-*) and out2/.

### stages
All 39 of my assigned finding ids are fixed. Most were done by the earlier attempt; I checked each one on the dev server, rebuilt the Entropy arcs and commit-log order, and made the Gravity and Evidence arithmetic read as a derivation. Type-check passes, prettier is clean, and axe reports no violations at 1440 or 390.

How I checked: Playwright on the dev server at 320, 360, 390, 640, 768, 1024, 1180, 1280 and 1440. That covered rendered SVG text sizes, sums for all 5 Gravity choices and all 6 Entropy steps, live-region text, accessible names, Tab and arrow-key walks, forced colors (dark and light), panel heights, commit-log shift, an arc-clearance scan at every step, and screenshots of every state.

**What I changed in this session**
- **Entropy arcs:** the arcs added by commits ran through other modules, so the drawing showed dependencies that do not exist. Payments→Auth crossed the Users joint, Users→Orders passed 4.5 units from Billing, and Auth→Orders cut through the "Orders" label. Each arc is now routed once, so it looks the same at every step. The router takes the gentlest bend that stays clear of other joints, of every module name, and of lines already at its ends. My scan finds no arc through a joint or name at 390 or 1440.
- **Entropy commit log:** it now sits right under the score at all widths. On a phone the drawing, the score and the commits fit in one view.
  - The modules in a cycle are named in the caption, with space reserved for the longest list.
  - Tapping any commit moves nothing, measured at 320 to 768.
  - The drawing is centered in its columns on desktop.
- **Gravity and Evidence arithmetic:** each row now reads as a derivation, for example "Reach 13 of 15 rest on it → 0.95 × 0.40 = 0.38". In a narrow ledger (phones and 1024) the calculation drops to its own line so the measurement never splits.

**Findings**
- **finish/#1:** fixed. Gravity on phones is a list of load levels with hatched ground under the foundation, in 14px HTML text. Impact on phones is a module-level drawing with labels at 12.0–12.7px. Every drawing is at least 11px from 640 up.
- **finish/#3:** fixed. Gravity uses the hero's level layout, ApiGateway on top, and lights everything that rests on the selected member (13 for Database). Imported from layout.ts, not edited.
- **finish/#4:** fixed. The commit log has joint markers on a hairline column; the inset side stripe is gone (box-shadow measures "none").
- **finish/#6:** fixed. The Impact counts are Martian Mono at 44px, the same size as the Entropy and Gravity scores.
- **finish/#7:** fixed. Raw measurement → normalized share × weight = contribution in Gravity and Evidence, with the formula and both scale numbers (15 and 210) in the note.
- **finish/#8:** fixed. Hatched ground under the Gravity drawing, the Gravity phone list and the Entropy drawing.
- **claims/B6, claims/B7, copy/C15, claims/C8, copy/C24:** fixed. The normalization note is accurate (log shares, spread saturates, scores move slightly as the system grows). The footnote cites all three established terms, calls spread Katedrala's own, and says the weights will be documented with milestone 6.
- **claims/C2:** fixed. The violation is labelled "hypothetical change". The rule check, file, error count, rule count and the allowed route are computed from the demonstration system plus one added import. The invented ":7" line number is gone.
- **claims/C3:** fixed. Displayed parts are rounded by largest remainder and add up to every displayed total (5 of 5 Gravity choices, 6 of 6 Entropy steps, Evidence).
- **claims/C9, copy/C4, copy/C5:** fixed. "Cross-module dependencies", correct runs/run agreement, the spread wording, and a lede that names all four factors.
- **claims/C11, copy/C3, copy/C25:** fixed. Betweenness is described as a sum of path shares and labelled "betweenness 13.2".
- **claims/C12:** fixed in my file ("HTTP handlers"). I kept the field name `entryPoints` because commands.ts uses it.
- **copy/C2, copy/C6, copy/C29:** fixed. Normalized × weight rows, "1 member" agreement, and the Impact footnote reads as a sentence.
- **a11y/A5:** fixed. Gravity choices are one Tab stop with arrow keys and wrap-around.
- **a11y/A6:** fixed. Short atomic status regions for Gravity, Impact and Entropy ("0.63 high entropy"); no aria-live left on whole panels.
- **a11y/A8:** fixed. The cycle's modules are named in the drawing's label and in the caption.
- **a11y/A9:** fixed. Original Entropy dependencies are at about 4.1:1. The Rules boxes depend on another fixer's change (below).
- **a11y/A13, visual/M6, visual/M7, visual/M8:** fixed by the phone versions above; Rules has an upright phone drawing at 11.8px or more.
- **a11y/B3:** fixed. Copy buttons are named after their block (e.g. "Copy katedrala.config.yaml"), each block has one status region, and a failed copy says so.
- **a11y/B4, a11y/B11:** fixed. Drawings carry full descriptions listing members by distance; the role=img change itself is in LoadDrawing.
- **visual/M11:** fixed. Gravity members no longer move when the choice changes, so lines and joints cannot come apart.
- **visual/N2:** fixed. The selected foundation's label sits below the ground line.
- **visual/N4:** fixed. The three Impact counts share one baseline.
- **visual/N6:** fixed. Inline code in the Evidence caption is set at 0.875em.
- **visual/N8:** fixed. The Entropy drawing is 1:1 at 15px labels, and nothing moves under the finger.
- **visual/N9:** fixed. The Rules panels end at the same height.
- **visual/N17:** fixed. The Evidence check marks are faint chalk, not load blue.
- **Optional force polygon:** done. Each term is drawn head to tail on one load line, closing to the score.

**Files changed** (all under C:/Users/Awab/Desktop/PROJECTS/Katedrala/site/)
- components/sections/Gravity.tsx, GravityStage.tsx, Entropy.tsx, EntropyStage.tsx, Impact.tsx, ImpactStage.tsx, Rules.tsx, Evidence.tsx
- components/ui/TermBar.tsx, CodeBlock.tsx
- lib/demo/metrics.ts, entropy.ts, impact.ts, system.ts
- app/styles/gravity.css, entropy.css, impact.css, rules-evidence.css, code.css

**Needs other owner**
- **explorer.css:** the Rules boxes reach 3:1 only through the explorer fixer's `.plan-bay rect { stroke: var(--color-ink-faint); stroke-opacity: 0.75 }`. That rule must stay.
- **LoadDrawing.tsx:** my phone drawings rely on its role=img for drawings you can't interact with and on its `minLabelPx` prop.
- **commands.ts:** it imports my `formatParts`, `RULE_CHANGE`, `RULE_CONFIG` and `checkRules`; all are kept as they are.
- **Pipeline.tsx:** the fan-in row the claims/C3 fix asked for in the Explain card is outside my files.

**Noticed, not fixed**
- **layout.ts module positions:** two straight Entropy lines are tight. Auth→Platform passes 8 units from the Users joint, and Auth→Users starts under the "Auth" name. Putting Auth's name on the right, or nudging x, would clear both; the hero's module drawing uses the same positions.
- **TermBar.tsx name:** it now exports the ledger parts and no longer exports `TermBar`. All callers are mine. Renaming the file would step outside my file list.

### content
All 19 findings assigned to me are fixed. Most of the work was already in the working tree from the earlier attempt. I checked each part against the repository, repaired a few details and verified on the live dev server at 320, 390, 768, 1024 and 1440 px. Type-check passes, all my files are prettier-clean with LF line endings, and axe-core reports 0 violations at 1440 and 390. No page overflows sideways at any of those widths, and the console is clean.

**Findings**
- **claims/A1 — fixed.**
  - Open source lede now reads "Katedrala is MIT licensed. Its engine, document contract, design decisions and roadmap all live in the repository."
  - Final CTA lede now reads "…open source and being built toward v1. …"
  - A search of the site sources, README, CONTRIBUTING and PRODUCT.md finds no "in public" left. Per D3, "Read every line of it." and the repository links stay.
- **claims/A2 — fixed.**
  - The Versioned schemas card says the format is specified as JSON Schema, generated from its TypeScript types and versioned in the repository, and that `analyzeStructure` returns the document's structural sections.
  - In Ecosystem, the "Your tools" card, the "Architecture document" chain step, the layer label and the "formal contract" fact were aligned the same way.
  - Checked against the schema-generation script, `StructureDocument` and `RepositoryStats`. No "published" or "validates against" wording remains.
- **claims/B3 and copy/C1 — fixed.** The analyze transcript shows "externals 59", then indented rows: npm packages 39, Node.js built-ins 8, environment variables 12. The numbers come from the CODEVERSE_ANALYSIS fields. Checked the rendered transcript at 1440 and 390.
- **claims/C10 and copy/C36 — fixed.**
  - Each change line is now computed from two consecutive versions, with module names capitalized: "Gateway, Auth, Users and Platform", "+ Payments module, 3 members", "+ Checkout, Orders and Billing modules, 7 members".
  - v4 is titled "Against the load path", its finding reads "New upward dependency: Payments → Auth.", and that edge is lit in load blue. The upward test is now a strict comparison, and v1 counts as a baseline with nothing new.
  - Each mini drawing now has a fuller text alternative, for example "v5: all 8 modules, 17 dependencies between them, 1 new. New cycle: …".
- **claims/C15 — fixed.**
  - Added "## Get started" to the root README: Node.js 22.12+, pnpm 11, clone, `pnpm install`, `pnpm build`, then an `analyze.mjs` that prints `document.repository.stats`, run with `node analyze.mjs <path>`.
  - I checked every command and import against the root package.json, the engine's exports and options, the stats type and the cache-directory code. I then ran the script's call against the built engine on `fixtures/dependency-violations`, with the cache redirected to the scratchpad, and it printed the stats.
  - `LINKS.readme` now points to `#get-started`. The page's `analyze.mjs` snippet now uses `root: "../CodeVerse"`, so it matches the README script and the CodeVerse output in its comment.
- **copy/C7 and a11y/B10 — fixed.** The roadmap beam is labelled "4 milestones done, 1 in progress, 10 planned"; the in-progress part is dropped when the count is 0. Checked in the DOM.
- **copy/C14 — fixed.** Ecosystem lede: "Katedrala is an engine, not a visualization product: it produces one versioned document for other tools to build on." I used "produces" rather than "writes" because nothing writes documents before the CLI. It runs 2 lines at 1440.
- **copy/C19 — fixed.** The "No model in the loop" fact is now "Built to extend": languages plug in through a typed adapter contract.
- **copy/C40 — fixed.** Superseded by D2: milestone 6 is named "Metrics", as in the roadmap.
- **copy/C41 — fixed.** MILESTONES matches docs/ROADMAP.md row for row. The progress sentence leaves out "in progress" when nothing is.
- **copy/C42 — fixed.** The Ecosystem foundation label now reads "parse, link, infer, analyze, explain".
- **copy/C55 — fixed.** "The same files, configuration and Katedrala version produce the same document, byte for byte."
- **a11y/B5 and visual/M10 — fixed.**
  - Below 1024 the command tabs wrap instead of scrolling: 2 per row at 320, 3+2 at 390, one row at 768. Every tab is fully on screen and 48 px tall.
  - `aria-orientation` follows the layout: vertical from 1024 up, horizontal below.
  - The history strip now runs to the screen edges, so the next version peeks in from past the frame instead of being cut inside the gutter, and the gutters fade.
  - The strip takes a Tab stop only while it scrolls, and arrow keys scroll it.
  - Verified layout measurements at all five widths and a keyboard walk at 390.
- **a11y/B9 — fixed.** The `$` prompt is ink-faint (5.98:1) and still can't be selected. The CodeBlock half was already done by its owner.
- **visual/N13 — fixed for the terminal.** CommandShowcase marks which side of a transcript still has more to scroll, and code.css fades that edge. At 390 it shows on health, impact, validate and diff, and flips sides when scrolled to the end.
- **visual/N14 — fixed.** Below 1024 only the last tool keeps its joint on the beam, so the stack reads as one column standing on the document. Checked at 390 and 768.
- **visual/N15 — fixed.** All marks sit on whole pixels with a 1 px crisp stroke. "Planned after v1" is drawn as the square's four corners, which stays distinct from the open and filled squares. I checked 5x enlargements of all 29 marks on the page at 1x.
- **finish/#8 — fixed.** The CTA headline now uses the section-heading style at display size. Its computed `font-variation-settings` is `"wdth" 80`, with weight 620, tracking -0.026em and normal word spacing. Its width per em matches every section h2 (3.937).

**Files changed:** README.md, site/components/sections/{History,Developers,CommandShowcase,OpenSource,Ecosystem,FinalCta}.tsx, site/components/ui/Status.tsx, site/lib/demo/{history,commands}.ts, site/lib/site.ts, site/lib/text.ts, site/app/styles/{status,history,developers,open-source,ecosystem}.css. Section.tsx and sections.css needed no change.

**Needs other owner**
- If you want a written launch gate (claims/A1, verified fix step 4), add a note to the Deploy section of site/README.md: deploy only once github.com/tedddby/Katedrala is public and every link built from `LINKS.repository` returns 200. That file is not mine.
- During one capture, EntropyStage.tsx (another fixer's file, edited mid-capture) threw "Cannot access 'GAP' before initialization". The next load was clean.

**Noticed, not fixed**
- `.eco-tool:hover` turns the tool's 1.5 px column line load blue. It belongs to the drawing, but a strict reading of the craft floor's colored-left-border ban could flag it.
- The terminal's line-by-line print replays on every tab switch, including arrow-key navigation, which is frequent for keyboard users.
- "The road to v1" is the only h3 without a closing period.
- The extra analyze rows for unresolved and untyped references (claims/B2, optional) need numbers from a fresh CodeVerse run, so I left them out.
