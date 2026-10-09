disposition: fix

Not read: the component sources beyond targeted greps (MemberCard.tsx, GravityStage.tsx, LoadDrawing.tsx, metrics.ts, globals.css lines 985-1025 and 1395-1426), PRODUCT.md contents (only existence checked), and the mobile per-section captures for how-it-works, entropy, rules, evidence, developers, open-source, ecosystem, get-started and footer (judged from the stitched mobile.png at overview scale). No motion was observable, so "settles under gravity" is unverified.

## persistence
Pass. site/PRODUCT.md exists. Code-led build, so no state file or comp round is expected, and .impeccable/mocks/ does not exist. The FORM seed key e2bab8cb is corroborated by .impeccable/decision/brief-body.md. DESIGN.md is absent as expected for a new world. Check 0 passed: desktop.png 1440x15045; mobile.png 390x19731, continuous nav to footer; no black, white or blank bands; every section capture matches its id.

## fidelity
No approved comp or critique-reference comp; judged against OWN-WORLD, the chosen "model-pick" option and the brief.

Mandatory rows:
- TYPE: match. Self-hosted Archivo condensed grotesk headlines and Martian Mono values via next/font; tracking -0.022/-0.026em, within floor. Uncited deviation: the final CTA headline ("Understand your system before you change it.") renders visibly wider/looser than every other h2, dropping the condensed voice.
- MATERIAL: match. Honest SVG line drawing throughout (hairlines, hatched ground, open-ring joints); no faked physicality, bevel or emboss.
- GROUND: match. Page field sampled from pixels on both captures: median rgb(14,16,18) = #0E1012, exactly OWN-WORLD's sheet.

Element rows:
- First viewport, left five columns (headline, one sentence, two actions) and right seven (drawing, level axis, hatched foundation, title block): match.
- Title block stating demonstration and in-development status: match.
- Identity card plus lit load path (FIRST VIEWPORT promise): contradicted. Desktop: card open on Database but Database's load path is not lit, so the first viewport carries no load blue at all. Mobile: card names "Database", a member that does not exist in the module-level drawing (foundation is "Platform").
- Load blue only on active members: match (gravity, impact, history v5, rules).
- Line weight proportional to load: match in code (LoadDrawing.tsx:144 strokeWidth(edge.load)); visually under-committed (see ceiling).
- Monospace for every measured value: contradicted in Impact; counts 6 / 4 / 3 in the sans while 0.22, 0.64 and every other measure is mono.
- Gravity drawing: contradicted. Caption says "Everything that rests on Database, directly or through other members"; the capture lights only Database's four direct bearers, the other nine resting members are unlit. Contradicted: the layout drops the hero's level axis (CheckoutController sits above ApiGateway; same-row members joined horizontally), so the same demonstration system reads as two different structures.
- Deliberate mobile graph representation (brief, contract constraint): Hero match (module-level redraw); Architecture match (defaults to Modules); Gravity and Impact missing: desktop SVG scaled down, member labels about 5-6 CSS px, unreadable at 390.
- History on mobile: acceptable adaptation (horizontal strip with clipped peek).
- Pipeline 01-05: acceptable adaptation (numbered sequence is the information).
- Roadmap 01-15 and dot row: match.
- Brief coverage (hero, pipeline, graph, gravity, entropy, impact, rules, evidence, history, CLI, open source, ecosystem, CodeVerse chain, final CTA): all present.

## ceiling
Unused native devices of the chosen world:
- Force polygons and funicular lines: none appear. The Gravity breakdown is four blue bar meters where a Cremona/force-polygon readout would be the world's own instrument.
- The hanging chain inverted into an arch (the option's own viewport): appears nowhere, not even as the one authored moment.
- Line-weight range: too narrow to read; in the hero almost every member renders as the same hairline, so "Line weight: load carried" is not legible at a glance.
- Hatched foundations: in hero, impact, ecosystem and final CTA, but not under the Gravity or Entropy foundations (plain rule).
- Section rhythm: all twelve sections open with the same block (rule, two-line h2 at one size, lede, status tag pinned about 700 px away at the right edge); the drawing sheet never varies its frame or scale.

## material_fixes
1. Fidelity, brief "deliberate mobile representation": redraw Gravity and Impact for 390 as module-level or leveled drawings with labels at 12 px or more, as the hero and Architecture already do; today they are shrunken desktop SVGs with unreadable labels (mobile-gravity.png, mobile-impact.png).
2. Contract FIRST VIEWPORT and STORY: the rest state must light the card's member's load path in load blue; on mobile the card must name and light a member that exists in the mobile drawing ("Platform", or rename consistently). Today the card describes a path nobody can see, and on mobile a member that is not drawn (components/hero/MemberCard.tsx, HeroDrawing).
3. Fidelity, Gravity: light the full reach set the caption promises (all 13 members resting on Database, not only its four direct bearers), and lay the drawing out on the hero's level axis so ApiGateway sits on top and load visibly flows down (components/sections/GravityStage.tsx).
4. Floor, side stripe: .commit[aria-pressed="true"] { box-shadow: inset 2px 0 0 var(--color-load) } is a 2 px coloured stripe on a list item, done as a box-shadow so the detector misses it. Replace with a world device (a joint marker on the commit-log rule, or the step label in load blue).
5. Floor, eyebrow: "Carries the most load" above the card heading "Database" (MemberCard.tsx:41) is a label above a heading. Fold it into the sentence ("Database carries the most load: 13 of 15 members rest on it...") and delete the label.
6. Contract OWN-WORLD, monospace for measured values: set the Impact counts 6 / 4 / 3 in the mono at display size, as Entropy's 0.22 and Gravity's 0.64 already are.
7. Truth, evidence legibility: Gravity prints "13 of 15 rest on it x 0.40 -> 0.38" and Evidence prints "6 of 15 ... +0.28"; the real math is log1p-normalized (lib/demo/metrics.ts:143), so a reader cannot reproduce either figure on a page whose thesis is "every conclusion has evidence". Show the normalized share, e.g. "13 of 15 -> 0.95 x 0.40 = 0.38".
8. Ceiling, signature device: widen the strokeWidth range so the members carrying the most load read clearly heaviest in the hero and impact drawings; put the hatched ground under the Gravity and Entropy foundations; set the final CTA headline back in the condensed width the rest of the page uses.

## keep
The leveled load drawing with its +-0 axis, hatched foundation and mono title block; the single load blue reserved for active load; and the honest status markers on every capability. Do not dilute any of them into generic graph styling or add colour.
