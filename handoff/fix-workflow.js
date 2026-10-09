export const meta = {
  name: 'landing-fixes',
  description: 'Apply the verified landing-page findings with file-owned fixers, then integrate, recapture and re-review',
  phases: [
    { title: 'Fix', detail: 'four fixers with disjoint file ownership' },
    { title: 'Integrate', detail: 'typecheck, static build, captures, axe, detector' },
    { title: 'Re-review', detail: 'finish reviewer verdict pass and resolution checks of every confirmed finding' },
  ],
}

const REPO = 'C:/Users/Awab/Desktop/PROJECTS/Katedrala'
const SITE = REPO + '/site'
const SP = 'C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad'
const REVIEW = SITE + '/.impeccable/review'
const PAIRED = SP + '/review-paired.md'
const FINISH = SP + '/finish-review-1.md'
const BRIEF = SP + '/landing-brief.md'
const CRAFT = 'C:/Users/Awab/.claude/plugins/cache/impeccable/impeccable/4.5.0/skills/impeccable/reference/craft-floor.md'

const DECISIONS = `CROSS-CUTTING DECISIONS (already decided; apply them, do not revisit):
D1 Status vocabulary: "Available today" (filled square), "Planned for v1" (status key "planned"), "Planned after v1" (key "after-v1"). Never write "in development" in visible copy. Present tense only for capabilities that are Available today; everything else is phrased as planned or future ("will", "is planned"). The rename of the key and labels is already done in lib/site.ts and every Status usage.
D2 Roadmap: milestones 1-4 are Done, 13 (Performance and caching) is In progress, the rest Planned; MILESTONES in lib/site.ts already mirrors docs/ROADMAP.md with the roadmap's exact milestone names.
D3 The GitHub repository is not public yet; the user publishes it later. Never claim the project is "developed in public" or "built in public". Openness claims that are true of the project itself are fine (MIT licensed, source and documentation in the repository). Links to the repository stay.
D4 Vocabulary: the demonstration system's units are "members" and "modules". Never call a demo member a "component" (in Katedrala a component is a physical unit, ADR-006), never call it a "joint" in copy (joint is only the drawing's circle). Relationships/dependencies as in docs/IR.md. American spelling. Thousands separators on every number of 1,000 or more in visible prose and terminal output (code samples may print raw numbers). Scores keep two decimals.
D5 Ledes at most two lines at 1440 px (about 120 characters). No em-dash (—) in any visible copy, no en-dash used as a dash. Section titles stay sentence-case statements ending with a period.
D6 Load Path world: near-black sheet #0E1012, chalk #E9E6DF, graphite #5D6166 only for decoration and non-text graphics (3.06:1), ink-faint #8B8E92 is the faintest text colour (5.79:1), load blue #3EA6FF only on architecture that is active right now (selected member, its load path, a cycle, a violation, a focused control). Sharp corners, hairlines, line weight proportional to computed load, hatched ground under foundations, condensed Archivo headlines, Martian Mono only for code and measured values. Craft floor bans (see ${CRAFT}): no eyebrows/kickers above headings, no side stripes (coloured left/right borders or inset box-shadows on cards and list items), no glyph icons, no gradient text.
D7 Every number stays computed (lib/demo) or real (lib/site.ts CODEVERSE_ANALYSIS, REAL_EDGE). CodeVerse externals are 59 = 39 npm packages + 8 Node.js built-ins + 12 environment variables (fields packages, builtins, environmentVariables in CODEVERSE_ANALYSIS); never call all 59 packages. Relationships = 14,233.
D8 Phones: every drawing must be readable at 390 px: SVG text at least 11 CSS px on screen, with a deliberate mobile representation (fewer labels, a module-level or leveled redraw, larger viewBox-relative type under a media query, or a list) rather than a shrunken desktop drawing. Tap targets at least 24x24 CSS px everywhere and 44x44 for primary controls on phones.
D9 Accessibility: keyboard operable everything with a visible focus indicator (a ring at least 2 px in load blue, not only a colour change); WAI-ARIA APG patterns for tabs, radio groups and composite widgets (one Tab stop per drawing with arrow keys between members, roving tabindex); prefers-reduced-motion respected; text alternatives for every visualization that name what the drawing shows; live regions short and atomic; forced-colors mode keeps selected states visible.`

const COMMON = `You are fixing the Katedrala landing page. Katedrala is an open-source, deterministic (no LLM) software-architecture analysis engine; the page lives in ${SITE}, a Next.js 16 App Router static export (React 19, Tailwind v4). Page composition: site/app/page.tsx; styles: site/app/globals.css imports one stylesheet per area from site/app/styles/; components in site/components/**; facts and links in site/lib/site.ts; demonstration-system computations in site/lib/demo/*.ts.
The user's verbatim brief: ${BRIEF}. The direction contract: ${SITE}/.impeccable/surfaces/app-page-tsx.md. Current captures of the page: ${REVIEW} (desktop.png, mobile.png, desktop-<section>.png, mobile-<section>.png).
The findings to fix are in ${PAIRED} (four audits; each finding is marked CONFIRMED, REFUTED or UNVERIFIED by an adversarial verifier; apply CONFIRMED findings, using the "Verified fix" where present because it supersedes the reviewer's fix; ignore REFUTED ones; UNVERIFIED ones only if you confirm them yourself). The Impeccable finish reviewer's material fixes are in ${FINISH}. Finding ids repeat across audits, so they are written here as <audit>/<id>: claims/, a11y/, copy/, visual/ and finish/#n.
${DECISIONS}
OWNERSHIP: four fixers work at the same time. Edit ONLY the files listed under "Your files". If a fix needs a change in a file you do not own, do not make it: describe it under "needs other owner" in your report. Keep exported component props and function signatures backward compatible unless every caller is yours.
TOOLS: a Next dev server for the site is shared by all fixers at http://localhost:3100 and reflects every saved edit (HMR). If it is not responding, start it from ${SITE} with "pnpm exec next dev --port 3100" as a background process; if that fails because another dev server holds the lock, someone else started it: wait and retry. Never run "pnpm build", "next build" or any command outside ${SITE} except prettier. Type-check with "pnpm exec tsc --noEmit" in ${SITE}. Format your files with "npx prettier --write <files>" run from ${REPO}. A Playwright harness is in ${SP}/shots (playwright-core drives Edge: chromium.launch({ channel: "msedge", headless: true }); axe-core and pngjs are installed there); write your scripts inside ${SP}/shots/<your name>/ so bare imports resolve, and verify your fixes on the live dev server at 1440 and 390 px (and 768 and 1024 where layouts change); scroll a section into view and wait about 1.5 s before judging drawings, they animate in.
QUALITY BAR: this page is meant to be world-class design engineering (Emil Kowalski's principles: purposeful motion of 150-400 ms with ease-out entrances, no animation on high-frequency interactions, precise details). Fix root causes, not symptoms; keep the code style of the surrounding code (comment density, naming, Tailwind usage).
RESUMED RUN: a first attempt at this fix pass was cut off when the session ended, after the fixers had worked for about 40 minutes. Its partial edits are in the working tree. The last commit (HEAD) contains the site exactly as reviewed, so "git diff HEAD -- <your files>" shows precisely what the earlier attempt already changed in your files (other fixers' partial edits are in their own files). Start by reading that diff: keep what is correct and complete, repair what is half-done, then finish the remaining findings. Read-only git commands (git diff, git status, git show) are allowed; never run git commands that write (add, commit, checkout, restore, reset, stash). Some files may have CRLF line endings from the earlier attempt; prettier normalizes them to LF when you format.
REPORT (your final message): for every finding id assigned to you: fixed / partly fixed / not fixed, one line on what changed and how you verified it; then the list of files you changed; then "needs other owner" items; then anything you noticed but did not fix.`

const FIXERS = [
  {
    key: 'hero-nav',
    files: `site/components/hero/Hero.tsx, site/components/hero/HeroDrawing.tsx, site/components/hero/MemberCard.tsx, site/components/drawing/LoadDrawing.tsx (shared by the hero and the Impact section: keep its props API backward compatible, additions only), site/components/site/Navbar.tsx, site/components/site/Footer.tsx, site/components/site/Wordmark.tsx, site/components/ui/Button.tsx, site/app/layout.tsx, site/app/styles/base.css, site/app/styles/drawing.css, site/app/styles/nav.css, site/lib/demo/layout.ts`,
    ids: `finish/#2 (the resting state must light the card's member's load path in load blue; on phones the card must name and light a member that exists in the mobile module drawing), finish/#5 (remove the eyebrow label above the card heading; fold it into the sentence), finish/#8 (widen the LoadDrawing stroke-width range so the members carrying the most load read clearly heaviest in the hero and Impact drawings), claims/B1 and copy/C54 (meta description: present tense only for what is available today), a11y/A1 and visual/M2 (one tap or one click selects a member; hover only previews with a mouse; Enter/Space select; Escape returns to the resting state), a11y/A2, a11y/A3 (scroll-padding so focused elements are not hidden behind the fixed nav), a11y/A7 and visual/M9 (mobile menu inside a nav landmark, closes on link choice, Escape and outside click, focus handling), a11y/A11 (forced colors for states in your files), a11y/A12 (unique ids for SVG patterns per drawing instance), a11y/A15 (hero drawing: one Tab stop, arrow keys between members), a11y/B1 (visible focus ring on drawing members), a11y/B8, a11y/B12, copy/C17, copy/C20, copy/C51, visual/M1, visual/M3 (no layout shift when the card changes: reserve its height), visual/N1, visual/N3, visual/N12 (for nav and hero controls).`,
  },
  {
    key: 'explorer-pipeline',
    files: `site/components/sections/Architecture.tsx, site/components/sections/ArchitectureExplorer.tsx, site/components/sections/Pipeline.tsx, site/lib/demo/plan.ts, site/app/styles/explorer.css, site/app/styles/pipeline.css`,
    ids: `claims/B2 and copy/C16 (the Link card overclaims resolution: say what is bound and that what cannot be bound is counted, not guessed), claims/B4 and visual/N16 (the Architecture section needs an honest status mark; module grouping is inference, planned for v1, while the file/symbol graph is available today: make the lede and marks say exactly that), claims/C5, copy/C18, copy/C22, copy/C23 (pipeline stages that are planned are phrased as planned), copy/C49, a11y/A4 (zoomed plan: keep keyboard focus on visible members or pan to the focused member), a11y/A9 (explorer bay boundaries and other meaningful marks at least 3:1), a11y/A10 (table alternative scroller focusable), a11y/A14 (allow pinch zoom: touch-action pan-y pinch-zoom, or a pinch handler), a11y/A15 (explorer: one Tab stop for the plan's members, arrow keys between them), a11y/B1 (visible focus ring on plan members), a11y/B2 (visible keyboard hint for sighted keyboard users), a11y/B6 (limit panning so the plan cannot leave the sheet), a11y/B7 (Members/Modules is a mutually exclusive choice: radio-group semantics), visual/C1 (pipeline layout 1024-1350 px, if you confirm it), visual/M4 (module view: no edge may pass through another module's joint; route edges so they read as real dependencies), visual/M5 (no width between 640 and 1279 px may open on an unreadable plan: choose the default view or layout per width so labels are at least 11 px), visual/N11, visual/N18 (no animated transition on wheel zoom or held-key panning).`,
  },
  {
    key: 'stages',
    files: `site/components/sections/Gravity.tsx, site/components/sections/GravityStage.tsx, site/components/sections/Entropy.tsx, site/components/sections/EntropyStage.tsx, site/components/sections/Impact.tsx, site/components/sections/ImpactStage.tsx, site/components/sections/Rules.tsx, site/components/sections/Evidence.tsx, site/components/ui/TermBar.tsx, site/components/ui/CodeBlock.tsx, site/lib/demo/metrics.ts, site/lib/demo/entropy.ts, site/lib/demo/impact.ts, site/lib/demo/system.ts, site/app/styles/gravity.css, site/app/styles/entropy.css, site/app/styles/impact.css, site/app/styles/rules-evidence.css, site/app/styles/code.css`,
    ids: `finish/#1 (deliberate phone representations for Gravity and Impact, labels at least 12 px), finish/#3 (Gravity: light the full reach set the caption promises, every member resting on the selected one directly or indirectly, and lay the drawing out on the hero's level axis so ApiGateway sits on top and load flows down; lib/demo/layout.ts belongs to another fixer: import from it, do not edit it), finish/#4 (replace the commit log's inset box-shadow side stripe with a world device such as a joint marker on the commit-log rule), finish/#6 (Impact counts in the mono at display size), finish/#7 (show the real arithmetic: raw measurement, normalized share, weight, contribution, e.g. "13 of 15 -> 0.95 x 0.40 = 0.38"), finish/#8 (hatched ground under the Gravity and Entropy foundations, as in the hero), claims/B6, claims/B7 and copy/C15 (never claim method documentation that does not exist yet; the method is documented with milestone 6), claims/C2 (the Rules violation is a hypothetical change to the demonstration system: label it so, and compute what can be computed), claims/C3 (displayed contributions must add up to the displayed total: allocate rounding with the largest-remainder method), claims/C8, claims/C9, claims/C11 and copy/C3 and copy/C25 (betweenness is a sum of path shares, not a count of paths), claims/C12, copy/C2, copy/C4, copy/C5, copy/C6, copy/C24, copy/C29, a11y/A5 (gravity choices: real radio-group keyboard behaviour), a11y/A6 (short atomic live regions), a11y/A8 (name the modules in a cycle in text), a11y/A9 (meaningful marks at least 3:1 in Rules and Entropy), a11y/A13, a11y/B3 (copy buttons named after their block; one polite status region), a11y/B4 (non-interactive drawings exposed as role=img with a full description), a11y/B11 (the tributary drawing's text alternative lists the members and distances), visual/M6, visual/M7 (a deliberate phone representation of the Rules violation), visual/M8, visual/M11 (edges move with their joints when the Gravity member changes), visual/N2, visual/N4, visual/N6, visual/N8, visual/N9, visual/N17 (check marks are not load blue). Optional, encouraged if it stays clear: the finish reviewer notes the world's native instrument, the force polygon, is unused; consider drawing Gravity's four weighted terms as a small force polygon (vectors head to tail, lengths proportional to contribution, closing to the resultant) beside the numeric rows, keeping the numbers.`,
  },
  {
    key: 'content',
    files: `site/components/sections/History.tsx, site/components/sections/Developers.tsx, site/components/sections/CommandShowcase.tsx, site/components/sections/OpenSource.tsx, site/components/sections/Ecosystem.tsx, site/components/sections/FinalCta.tsx, site/components/ui/Status.tsx, site/components/ui/Section.tsx, site/lib/demo/history.ts, site/lib/demo/commands.ts, site/lib/site.ts, site/lib/text.ts, site/app/styles/status.css, site/app/styles/sections.css, site/app/styles/history.css, site/app/styles/developers.css, site/app/styles/open-source.css, site/app/styles/ecosystem.css, and the repository's root README.md (only to add a "Get started" section)`,
    ids: `claims/A1 (see D3: remove every "developed in public" / "built in public" claim; keep true openness claims), claims/A2 (the schema guarantee: say exactly what is true today: the document format is specified as JSON Schema generated from the TypeScript types, versioned, in the repository; analyzeStructure returns the structural sections of that document), claims/B3 and copy/C1 (analyze transcript: show the externals breakdown, see D7), claims/C10 and copy/C36 (history: v4 title and finding consistent with what changed; module names capitalized), claims/C15 (make "Get started" real: add a concise "Get started" section to the root README.md for someone who wants to try the engine today from a clone: requirements (Node.js 22.12+, pnpm), clone, pnpm install, pnpm build, and a short script calling analyzeStructure from @katedrala/engine that prints document.repository.stats; check every command and import against the repository before writing it; then point LINKS.readme at that heading's anchor), copy/C7, copy/C14, copy/C19, copy/C40, copy/C41, copy/C42, copy/C55 (the determinism guarantee: the same snapshot (files, configuration, Katedrala version) produces the same document byte for byte), a11y/B5 and visual/M10 (command tabs row and history row on phones: every tab reachable and visibly indicated, peeking items not sliced in the gutter, a clear cue that the row scrolls), a11y/B9 (the $ prompt must not be text in graphite), a11y/B10, visual/N13 (scroll cue for code and terminal on phones), visual/N14 (ecosystem on phones: the stacked tools must not read as resting on each other), visual/N15 (a status mark for "Planned after v1" that is distinct and legible at 1x), finish/#8 (set the final CTA headline in the same condensed width as the rest of the page; check computed font-variation-settings).`,
  },
]

phase('Fix')
const fixed = await parallel(
  FIXERS.map((f) => () =>
    agent(
      `${COMMON}\n\nYOUR NAME: ${f.key}\nYOUR FILES: ${f.files}\nYOUR FINDINGS: ${f.ids}`,
      { label: 'fix:' + f.key, phase: 'Fix' },
    ),
  ),
)
const fixReports = FIXERS.map((f, i) => `### ${f.key}\n${fixed[i] ?? '(no report: the agent failed)'}`).join('\n\n')

phase('Integrate')
const integration = await agent(
  `${COMMON}

YOUR NAME: integrator. The four fixers have finished; their reports follow. You own every file in ${SITE} for integration fixes only: resolve conflicts between their changes, apply every "needs other owner" item that is clearly right, and fix anything broken. Then:
1. "pnpm exec tsc --noEmit" in ${SITE} must pass.
2. Stop any dev server you can see is not needed (do not kill processes you did not start unless the build needs it), then run "pnpm build" in ${SITE}; it must succeed.
3. Run "node capture.mjs ${REVIEW}" from ${SP}/shots: it serves the fresh static export in-process and rewrites every review capture, including full-page desktop.png and mobile.png stitched from segments. Then run the accessibility audit: copy ${SP}/shots/axe.mjs into ${SP}/shots/integrator/ and adapt it to serve ${SITE}/out in-process the way capture.mjs does (the old server URL is gone); it must report 0 violations at 1440 and 390.
4. Run the design detector: "C:/Users/Awab/.claude/plugins/cache/impeccable/impeccable/4.5.0/skills/impeccable/scripts/impeccable" detect --json app components lib (from ${SITE}); it must return [] or you fix what it reports.
5. Grep the visible copy for em-dashes and for "in development" / "in public".
Return: what you changed, every check's result, and the paths of the new captures.

FIXER REPORTS:
${fixReports}`,
  { label: 'integrate', phase: 'Integrate' },
)

phase('Re-review')
const finishPacket = `Verdict pass (round 2) for the Katedrala landing page finish review. Your round-1 review is in ${FINISH}; read it first: it lists your eight material fixes. The parent applied fixes and recaptured over the same screenshot files you read in round 1: ${REVIEW}/desktop.png (1440 wide, full page), ${REVIEW}/mobile.png (390 wide, full page in CSS pixels, stitched from segments), and per-section captures ${REVIEW}/desktop-<id>.png and ${REVIEW}/mobile-<id>.png for top, how-it-works, architecture, gravity, entropy, impact, rules, evidence, history, developers, open-source, ecosystem, get-started, footer, plus desktop-first-viewport.png and mobile-first-viewport.png. Other inputs as before: brief ${BRIEF}; direction contract ${SITE}/.impeccable/surfaces/app-page-tsx.md; PRODUCT.md ${SITE}/PRODUCT.md; decision payload ${SITE}/.impeccable/decision/direction.json (chosen option "model-pick", Load Path; no quality bar card file and no comp, code-led build); craft floor ${CRAFT}; artifact ${SITE}/app/page.tsx and its imports. The parent's narration is not evidence; score each of your material fixes as resolved, partial or unresolved from what the captures and the code show, name at most three regressions, and recompute the disposition. You have no browser.`
// The finish verdict is skipped: the page is being redesigned around a new centerpiece and gets its own finish
// review then. The resolution checks stay, because the honesty and accessibility fixes carry into the redesign.
const verdict = 'skipped: the page is being redesigned'
const [claimsCopy, a11yVisual] = await parallel([
  () =>
    agent(
      `${COMMON}

YOUR NAME: resolution-check-claims-copy. Review only, do not edit any file. For EVERY finding marked CONFIRMED under "claims-audit" and "copy-edit" in ${PAIRED}, check the current source and the new captures (and the live dev server if it is running, otherwise build nothing: read the code) and decide: resolved, partly resolved, unresolved, or regressed. Also re-read all visible copy once more against D1-D7 and the brief's honesty rules, and report any new problem the fixes introduced. Return a table: id, state, evidence (file and string), and the exact remaining fix for anything not resolved.`,
      { label: 'check:claims-copy', phase: 'Re-review' },
    ),
  () =>
    agent(
      `${COMMON}

YOUR NAME: resolution-check-a11y-visual. Review only, do not edit any file. Serve ${SITE}/out in-process with a small node http server inside your script (see ${SP}/shots/capture.mjs for the pattern) and test the built page with Playwright. For EVERY finding marked CONFIRMED (or UNVERIFIED and confirmed by a fixer) under "accessibility-audit" and "visual-responsive-audit" in ${PAIRED}, decide: resolved, partly resolved, unresolved, or regressed, with evidence (measurement, keyboard sequence, capture). Check 320, 390, 768, 1024, 1280 and 1440 px, keyboard-only use of every interactive drawing, reduced motion, and tap targets. Report any regression the fixes introduced. Return a table: id, state, evidence, and the exact remaining fix for anything not resolved.`,
      { label: 'check:a11y-visual', phase: 'Re-review' },
    ),
])

return { fixReports, integration, verdict, claimsCopy, a11yVisual }
