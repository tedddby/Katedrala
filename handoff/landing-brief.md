ok now while reasearch is still on going: 

<pasted_content id="c3c1">
# Katedrala — Landing Page

Build a **world-class, highly distinctive landing page for Katedrala**.

Katedrala is an open-source software architecture intelligence engine.

Its purpose:

> **Katedrala understands the architecture hidden inside your code.**

It analyzes source code and reconstructs:

```text
Source Code
    ↓
Symbols
    ↓
Relationships
    ↓
Dependencies
    ↓
Components
    ↓
Modules
    ↓
Architecture
    ↓
Insights
```

Katedrala will eventually power CodeVerse, but Katedrala itself is a standalone developer infrastructure product.

The landing page should make this immediately understandable while making developers curious enough to explore the project.

---

# FIRST: USE YOUR DESIGN SKILLS

You have access to:

* Emil Kowalski Design Engineering
* Impeccable
* Taste

USE THEM.

Do not merely satisfy the functional requirements.

Treat this as a design-engineering project where typography, spacing, hierarchy, motion, interaction, composition, responsiveness, accessibility, and micro-interactions all matter.

Before implementing:

1. Inspect the existing repository.
2. Understand the current stack.
3. Inspect any existing application UI and design language.
4. Read the available design skills and apply their principles.
5. Establish a visual direction specifically for Katedrala.

Do not copy the visual identity of another company.

Do not make this look like a generic AI startup.

---

# THE CORE CREATIVE DIRECTION

The name Katedrala means **cathedral**.

Use that concept as a subtle conceptual foundation.

A cathedral is:

* enormous structure built from many smaller parts
* carefully organized
* layered
* interconnected
* supported by foundations
* understandable as both individual components and one complete system

Software architecture has the same property.

Katedrala should visually communicate:

> **Your codebase is a structure. Katedrala reveals the structure.**

Do NOT make the page look like a literal medieval cathedral.

No cheesy church imagery.

No crosses.

No fantasy aesthetic.

The cathedral metaphor should exist through:

* structure
* geometry
* hierarchy
* foundations
* interconnected elements
* depth
* scale
* negative space

Think **architectural instrument**, not fantasy artwork.

---

# VISUAL PERSONALITY

The site should feel:

* technical
* intelligent
* precise
* architectural
* premium
* experimental
* restrained
* slightly mysterious
* developer-native

Avoid:

* generic purple AI gradients
* excessive glassmorphism
* stock illustrations
* generic floating SaaS cards
* giant gradient blobs
* excessive rounded cards
* meaningless animations
* fake terminal screenshots
* "AI-powered" marketing language
* cliché rocket/brain imagery

Katedrala should feel like a **serious piece of developer infrastructure**.

---

# THE HERO

The hero is the most important part.

Use a headline along the lines of:

> **See the architecture inside your code.**

or another stronger variation you determine during implementation.

Supporting copy should explain Katedrala in one or two sentences.

Something conceptually like:

> Katedrala reconstructs the architecture of your software from source code — revealing dependencies, boundaries, structural risks, and the impact of change.

CTA:

```text
Explore Katedrala
View on GitHub
```

Do not overdo CTA buttons.

---

# HERO VISUAL — THIS MUST BE SPECIAL

Do NOT put a generic screenshot beside the hero text.

Instead, create an interactive **living architecture visualization**.

Imagine a dark architectural space containing:

```text
                ┌───────────┐
                │  Payments │
                └─────┬─────┘
                      │
            ┌─────────▼─────────┐
            │    OrderService   │
            └──────┬───────┬────┘
                   │       │
             ┌─────▼──┐ ┌──▼─────┐
             │ Users  │ │ Billing│
             └────────┘ └────────┘
```

But make it beautiful.

It should feel like an actual software architecture being reconstructed in real time.

Potential behavior:

1. Start with scattered nodes.
2. Connections appear.
3. Nodes organize themselves.
4. Modules emerge.
5. Boundaries become visible.
6. The final architecture settles into a coherent structure.

This should communicate:

> **Katedrala turns chaos into architecture.**

The animation must be subtle and performant.

No perpetual seizure-inducing movement.

Respect `prefers-reduced-motion`.

---

# MAKE THE VISUALIZATION INTERACTIVE

On hover:

* highlight the selected node
* illuminate its relationships
* dim unrelated nodes
* show its identity

For example:

```text
PaymentService

Module
Payments

Depends on
StripeClient
PaymentRepository

Depended on by
CheckoutService
OrderService
InvoiceService

Architectural Gravity
0.87
```

This is not merely decoration.

The hero visualization should teach the product.

---

# SECTION: FROM CODE TO ARCHITECTURE

Create a visually strong section showing the transformation:

```text
SOURCE
  ↓
UNDERSTAND
  ↓
MODEL
  ↓
ANALYZE
  ↓
ARCHITECTURE
```

Each stage should correspond to something Katedrala actually does.

Example:

```text
01  Parse

Extract files, symbols, imports and relationships.

02  Link

Resolve references and construct the dependency graph.

03  Infer

Discover components, modules and architectural boundaries.

04  Analyze

Measure coupling, centrality, entropy and structural risk.

05  Explain

Expose evidence behind every conclusion.
```

Make this feel like an engineering pipeline rather than a marketing feature grid.

---

# SECTION: THE ARCHITECTURE GRAPH

Show an interactive graph.

Do not use a static image.

The graph should demonstrate:

* nodes
* directed edges
* different relationship types
* modules
* boundaries
* dependency flow

Allow interaction such as:

* hover
* click
* focus
* zoom
* pan

Keep the graph controlled and aesthetically coherent.

---

# SECTION: ARCHITECTURAL GRAVITY

Introduce Katedrala's concept of **Architectural Gravity**.

Example:

> Some components hold a system together more than others.

Show a component with many dependency paths passing through it.

Visualize:

```text
          Auth
           │
           ▼
        Gateway
       ↙   ↓   ↘
 Users   Orders   Payments
           │
           ▼
        Database
```

Then highlight the central component.

Explain:

> Katedrala measures structural importance using graph relationships such as dependency reach, fan-in, fan-out and centrality.

Do not make unsupported scientific claims.

This should feel like a real engineering concept, not marketing fluff.

---

# SECTION: ARCHITECTURAL ENTROPY

Introduce the concept carefully.

Show a clean architecture gradually becoming tangled.

Example:

```text
LOW ENTROPY

Auth → Users
Orders → Payments
Payments → Billing


HIGHER ENTROPY

Auth ↔ Orders
      ↘ Payments
Users ↔ Billing
Payments → Auth
Orders → Users
Billing → Orders
```

Then show Katedrala detecting the structural degradation.

The visual should make the concept immediately understandable.

---

# SECTION: CHANGE IMPACT

This should be one of the strongest sections.

Show:

```text
"What happens if I change PaymentService?"
```

Then animate the dependency graph outward.

Highlight affected components.

Display:

```text
47 files
8 modules
3 data entities
2 external integrations
```

Then explain:

> Katedrala traces dependency paths to estimate the structural blast radius of a change.

This is a highly practical developer feature.

Make the interaction feel like a developer actually querying the system.

---

# SECTION: ARCHITECTURAL RULES

Show that teams can define architecture explicitly.

Example:

```yaml
rules:

  controllers:
    cannot_depend_on:
      - database

  payments:
    cannot_depend_on:
      - analytics
```

Then show a violation being detected.

Example:

```text
Architecture violation

OrderController
      ↓
OrderRepository

controllers → repositories is prohibited
```

This section should communicate that Katedrala isn't only observational.

It can enforce architectural intent.

---

# SECTION: EXPLAINABILITY

This is important.

Katedrala should never feel like a mysterious black box.

Show:

```text
Why is PaymentService considered high gravity?

✓ 19 components depend on it
✓ 6 modules communicate through it
✓ High betweenness centrality
✓ 3 external integrations originate here
```

The core message:

> **Every conclusion has evidence.**

This should become part of Katedrala's identity.

---

# SECTION: ARCHITECTURE OVER TIME

Show architecture changing across Git commits.

Something like:

```text
v1
   clean boundaries

v2
   + payments

v3
   + orders

v4
   ⚠ cross-boundary dependency

v5
   ⚠ circular dependency
```

Then show Katedrala detecting the architectural drift.

This introduces the Git/history capabilities without needing a giant explanation.

---

# SECTION: BUILT FOR DEVELOPERS

Show actual interfaces:

```bash
katedrala analyze .
```

```bash
katedrala health .
```

```bash
katedrala impact PaymentService .
```

```bash
katedrala validate .
```

```bash
katedrala diff HEAD~1 HEAD .
```

The terminal UI should be extremely polished.

It should feel like a real CLI rather than a marketing mockup.

---

# SECTION: OPEN SOURCE

Katedrala is open source.

Make GitHub prominent.

Show:

```text
Open source
TypeScript
Deterministic
Extensible
Language-aware
Machine-readable
```

Include:

```text
GitHub
Documentation
Architecture
Contributing
```

Use actual repository information if available.

Do not fabricate GitHub stars, downloads, users, benchmarks, or production customers.

---

# SECTION: BUILT TO POWER OTHER TOOLS

Introduce the ecosystem concept:

```text
                  KATEDRALA
                      │
        ┌─────────────┼─────────────┐
        ↓             ↓             ↓
    CodeVerse       CI/CD        IDEs
        │             │             │
     Visualize      Enforce       Explore
```

Message:

> Katedrala is an architecture engine, not a visualization product.

This is important.

CodeVerse is one consumer.

Other tools should be able to build on Katedrala's IR and APIs.

---

# CODEVERSE CONNECTION

Near the end, show:

> **Katedrala powers CodeVerse.**

Then show a beautiful transition:

```text
Repository
    ↓
Katedrala
    ↓
Architecture IR
    ↓
CodeVerse
    ↓
3D software city
```

If the existing CodeVerse project or URL is available in the repository, use it accurately.

Do not fabricate functionality.

---

# FINAL CTA

End with a strong, minimal section.

Something like:

> **Understand your system before changing it.**

Then:

```text
[ Get Started ]
[ View on GitHub ]
```

Keep the final section dramatically simpler than the hero.

---

# TYPOGRAPHY

Typography should be a major part of the design.

Use a strong display typeface for major headlines and a highly readable technical/system font for supporting information.

Do not use five fonts.

Establish:

* display scale
* body scale
* monospace scale
* labels
* code
* metadata

Pay close attention to:

* line height
* letter spacing
* optical sizing
* text width
* hierarchy

Do not make every heading enormous.

---

# COLOR

Create a restrained architectural palette.

Avoid generic startup gradients.

Consider:

* deep near-black foundation
* warm/off-white typography
* restrained architectural accent
* subtle grid lines
* muted secondary text
* one strong highlight color for active architecture

The accent should be meaningful.

For example, connections and active architectural paths could use the accent.

Do not turn the entire page into a neon cyberpunk dashboard.

---

# BACKGROUND

Use subtle structure in the background:

* architectural grid
* coordinate lines
* node traces
* very subtle noise
* section dividers
* depth

The background should reinforce the concept without competing with the content.

---

# MOTION

Motion should communicate meaning.

Use animation for:

* architecture reconstruction
* dependency traversal
* graph focus
* section transitions
* revealing relationships
* state changes
* interaction feedback

Do NOT animate everything.

Avoid:

* endless floating
* excessive parallax
* random particle systems
* generic scroll animations
* giant blobs moving around

Every animation must answer:

> What does this animation communicate?

Keep interactions responsive.

Respect reduced motion.

---

# MICRO-INTERACTIONS

Pay extreme attention to:

* buttons
* links
* graph nodes
* code blocks
* copy buttons
* navigation
* hover states
* focus states
* scroll transitions

Buttons should feel physical.

Graph nodes should feel alive.

Code blocks should feel like actual developer tools.

Nothing should feel like a template.

---

# NAVIGATION

Keep navigation minimal.

Suggested structure:

```text
KATEDRALA

Architecture
How it works
Concepts
Developers
GitHub

                    Get Started
```

The navbar should become slightly more compact / visually defined when scrolling if appropriate.

Do not build a giant mega-menu.

---

# RESPONSIVE DESIGN

Do not treat mobile as an afterthought.

The architecture visualization must have a deliberate mobile representation.

On mobile:

* simplify graph complexity
* preserve the conceptual animation
* maintain hierarchy
* keep interactions usable
* prevent horizontal overflow
* preserve typography quality

Test:

* desktop
* laptop
* tablet
* mobile

---

# ACCESSIBILITY

Implement:

* semantic HTML
* keyboard navigation
* visible focus
* sufficient contrast
* reduced motion
* accessible buttons
* appropriate ARIA only where necessary
* graph alternatives for users who cannot interact visually

The site should remain understandable without animation.

---

# PERFORMANCE

This is a developer tool landing page.

It must be fast.

Do not ship enormous libraries simply for decorative effects.

Prefer:

* CSS
* SVG
* Canvas where justified
* existing project dependencies
* lightweight animation primitives

Lazy-load expensive visualizations when appropriate.

Do not block initial rendering with unnecessary computation.

---

# IMPORTANT: DO NOT FAKE THE PRODUCT

The landing page can use controlled demonstration data.

But clearly structure demo components as demonstrations.

Do not claim:

* fake benchmarks
* fake customers
* fake users
* fake downloads
* fake GitHub stars
* fake language support
* fake capabilities

Every product claim must correspond to Katedrala's actual implementation or be clearly presented as a future capability.

---

# IMPLEMENTATION QUALITY

Use the existing project's technology stack.

Do not rewrite the project unnecessarily.

Keep the landing page modular.

Create reusable components for:

* Navbar
* Hero
* ArchitectureGraph
* Pipeline
* ArchitectureGravity
* EntropyDemo
* ImpactDemo
* RulesDemo
* ExplainabilityDemo
* HistoryDemo
* CLIShowcase
* Ecosystem
* Footer

Keep data separate from presentation where appropriate.

---

# DESIGN PROCESS

Before coding the final page:

1. Inspect the repository.
2. Inspect the installed skills.
3. Establish the visual language.
4. Identify reusable components.
5. Design the hero interaction.
6. Design the architecture visualization.
7. Implement the visual system.
8. Build the page.
9. Test responsiveness.
10. Review every animation.
11. Review typography and spacing.
12. Remove anything that feels generic.
13. Run accessibility checks.
14. Run performance checks.
15. Take a final design pass.

Use your design skills actively throughout this process.

---

# QUALITY BAR

The final result should feel like something a developer would encounter and immediately think:

> "What the hell is this? I want to see how it works."

Not:

> "This looks like another SaaS landing page."

It should communicate the sophistication of the underlying engineering.

The landing page itself should demonstrate Katedrala's central idea:

> **Complex systems become understandable when their structure is revealed.**

Make the interface itself an example of that philosophy.

Do not stop at a functional page.

Push the visual hierarchy, interaction design, motion, typography, and information architecture until the result feels intentional at every level.

Then perform a final ruthless design review:

* What looks generic?
* What feels unnecessary?
* What feels visually noisy?
* What interaction doesn't communicate anything?
* What spacing feels wrong?
* What typography feels weak?
* What could be simpler?
* What could be more memorable?

Fix those issues before considering the landing page complete.
</pasted_content id="c3c1">
