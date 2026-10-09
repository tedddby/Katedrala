# Katedrala algorithms

This document specifies the algorithms behind Katedrala's analysis results: what each one computes, why,
with which parameters, and where its limits are. It is normative for the behaviour of the analysis packages,
as [IR.md](IR.md) is for the data model. Milestone 5 adds architectural inference: components, architectural
roles, modules and layers (`@katedrala/inference`). Metrics are documented here from milestone 6.

Contents: [Conventions](#conventions) · [Shared definitions](#shared-definitions) ·
[Components](#components) · [Architectural roles](#architectural-roles) · [Modules](#modules) ·
[Layers](#layers) · [Evidence and explanation](#evidence-and-explanation) ·
[Configuration reference](#configuration-reference) · [Complexity and scale](#complexity-and-scale) ·
[Results on the fixtures](#results-on-the-fixtures) · [References](#references) ·
[Decision numbers](#decision-numbers)

## Conventions

**Truth labels.** Every algorithm and every conclusion carries one of three labels, in this document, in the
TSDoc of the code and in the wording of the output:

- **[ESTABLISHED]**: a published concept or algorithm, cited in [References](#references).
- **[DERIVED]**: a deterministic function of observed facts, with no judgement involved (components,
  aggregated dependencies).
- **[KATEDRALA HEURISTIC]**: a rule Katedrala chose, with its rationale and its limitations. It is never
  presented as established. Architectural roles, modules and layers are inferred by such rules.

**Wording of heuristic conclusions.** An inferred conclusion says that it is one:

- every `InferenceInfo.reason` begins with "Inferred:";
- every description of a structural class (composition root, utility, barrel), of a relocation or of an
  attachment names the rule, says "(Katedrala heuristic)" and states what triggered it, for example "Treated
  as a composition root by the shape rule (Katedrala heuristic): nothing outside its unit depends on it; its
  dependencies spread over 3 other units, none above 50%";
- a composition root that is also a declared entry point or a barrel says so before the rule, so that a
  package's public barrel never reads as wiring code;
- descriptions of measurements (weighted signals) are factual sentences about what was measured.

**Determinism.** The same document and configuration give byte-identical results on every platform:

- no randomness, no clock and no locale; lint enforces this for `@katedrala/inference`;
- text processing is ASCII-only: tokens split at ASCII separators and camel-case boundaries, and only `A`–`Z`
  are case-folded. The Unicode tables of the runtime never decide a stem or a module id (non-ASCII letters
  are kept as letters, so `Été` and `été` are different names);
- every iteration follows a sorted order (scopes and files by id, directories by path, stems and keys by
  UTF-16 code units); every tie is broken by the smallest key;
- arithmetic is exact where decisions are made: edge weights are 1 or `type_only_weight`, a multiple of
  1/1024, so every sum of weights is a dyadic rational computed exactly in float64, and mathematically equal
  sums compare equal whatever the summation order. Thresholds are compared on sums (`inW > 0.5 · total`),
  never on quotients; quotients (shares, ratios, confidences) are computed from exact sums and only
  reported. The two threshold comparisons on quotients are exact at their boundaries: stem coverage is a
  correctly rounded quotient (3/10 against 0.3 compares equal), and label scores are compared after rounding;
- results do not depend on the order of the document's arrays or of the configuration's keys.

**Rounding.** Published real values are rounded with `roundMetric` to 9 significant digits (IR.md,
"Conventions"). A confidence is computed from the unrounded values and then rounded; recomputing
`Σ weight × value` from the rounded fields agrees within 1e-8. Numbers in descriptions are formatted from the
rounded values with `toFixed` (percentages as integers, weights with one decimal, values with two or three),
so the text and the fields agree.

**Signal ids are a contract.** The `signal` of every evidence entry (`internal-edge-ratio`,
`relocated-files`, `upward-dependencies`, ...) is stable: anomalies (milestone 7), rules (milestone 8),
diff (milestone 10) and CodeVerse read them. Renaming one is a breaking change of the method version.

## Shared definitions

### The weighted file graph [KATEDRALA HEURISTIC]

Module inference and layer ordering read dependencies through one weighted file graph.

- **Nodes.** Module inference: the files whose role is in `inference.modules.file_roles` (default `source`)
  and that no declared module owns. Layer ordering: every `source` file, declared-module files included,
  because layers are orthogonal to modules.
- **Edges.** The file-level projection of `@katedrala/model` with the edge kinds of the metrics projection
  (every kind except `depends-on-package` by default), type-only edges included. For every ordered file
  pair `(u, v)`, `u ≠ v`:
  - an underlying IR edge is _admitted_ when its `confidence` is at least `min_edge_confidence` (0.5);
  - a pair without admitted edges is no arc;
  - the weight is 1 when some admitted edge is a runtime (not type-only) edge, else `type_only_weight`
    (0.5); with `type_only_weight: 0`, type-only pairs are no arcs.

  Only admitted edges decide runtime against type-only: a 0.3-confidence runtime edge next to a 0.9
  type-only edge gives `type_only_weight`. Type usage counts because it expresses logical coupling, at a
  reduced weight because it vanishes at runtime. `analysis.include_type_only` does not apply:
  `type_only_weight` is inference's own control.

- **Why distinct pairs, not observation counts.** One file calling thirty functions of another would
  otherwise outvote thirty files that each import it once. Membership is a question of _which files_ work
  together, which is also how the fixtures define "mostly" ("a strict majority of the distinct dependent
  files"). The linker lifts symbol-level relationships (calls, type references through barrels) to the
  files, and the accuracy of these dependencies matters for recovery quality (Lutellier et al. 2018).
- **Degrees.** Per node, the number of distinct targets reached by an admitted edge (weight 0 included) and
  how many of those carry a `re-exports` edge; the barrel test of P3 uses them.
- **Scopes.** Module inference restricts the graph to one package at a time; an edge to another package is
  never evidence for a module (see [P0](#p0-scopes-and-nodes)).

Cost: O(n + m_IR) time over the memoized projection, O(n + m) memory, with no allocation per underlying
edge.

### Tokens, the S-stemmer and file stems [KATEDRALA HEURISTIC]

- **Name parts.** The last extension of a file name is stripped and the rest split on `.`: the first part is
  the _head_, the others are _qualifiers_, ASCII-lower-cased (`payment.controller.ts` → head `payment`,
  qualifier `controller`).
- **Tokens.** A text is split on runs of characters that are neither ASCII letters, ASCII digits nor
  non-ASCII characters, then at camel-case boundaries (`aB` and `ABc` → `A` `Bc`). Each token keeps its
  original spelling and an ASCII-lower-cased key: `OrderLine` → `Order` `Line`; `HTTPServer` → `http`
  `server`; `v2Api` → `v2` `api`; `Été-Facture` → `Été` `facture`.
- **S-stemmer.** Harman's S-stemmer (Harman 1991) [ESTABLISHED] with a sibilant rule and length guards
  [KATEDRALA HEURISTIC]; the first rule that applies wins:

  | #   | Word                                    | Condition                        | Result                                               |
  | --- | --------------------------------------- | -------------------------------- | ---------------------------------------------------- |
  | 1   | ends in `ies`                           | not `eies` or `aies`, length > 4 | `-ies` → `-y` (`categories` → `category`)            |
  | 2   | ends in `sses`, `xes`, `shes` or `zzes` |                                  | drop `es` (`addresses` → `address`)                  |
  | 3   | ends in `es`                            | not `aes`, `ees` or `oes`        | drop `s` (`pies` → `pie`, `services` → `service`)    |
  | 4   | ends in `s`                             | not `ss` or `us`, length > 3     | drop `s` (`payments` → `payment`; `bus`, `ids` kept) |
  | 5   | otherwise                               |                                  | unchanged                                            |

  Stems are used for grouping only; names keep the original spelling.

- **File stem.** The S-stem of the key of the head's first token, unless it is a generic token or a
  naming-suffix key (both vocabularies below), or shorter than 2 characters; then the file has no stem.
  `payment-gateway.ts` → `payment`; `order-line.ts` → `order`; `OrderService.ts` → `order`; `index.ts` and
  `dto.ts` have none. Only the first token counts, and its original spelling travels with the stem, because
  module names use it.
- **Plural** (for module names): consonant + `y` → `ies`; `s`, `x`, `z`, `ch`, `sh` → `+es`; otherwise `+s`;
  the case of the word is kept (`Payment` → `Payments`).

### Directory kinds and source roots [KATEDRALA HEURISTIC]

Every directory name has one kind, decided by the vocabularies below in this precedence: **container** >
**layer** > **shared** > **feature**.

- _container_: the exact ASCII-lower-cased name is a container entry (not stemmed: with stemming,
  `domains/` would capture the layer `domain` and `libs/` the shared `lib`);
- _layer_: the S-stemmed name is a key of `directory_layers`;
- _shared_: the S-stemmed name is a shared entry;
- _feature_: anything else.

The **source root** of a scope descends from the package directory (or the analysis root) while the
directory contains no file of the scope directly and exactly one child directory holds such files
(`packages/api` → `packages/api/src`). Module inference computes it over the scope's inference nodes; roles
and layers compute it over all `source` files of the package, declared-module files included, so that
declaring a module never changes another file's location vote.

### Default vocabularies

Every list is configurable (see [Configuration reference](#configuration-reference)). The defaults encode
TypeScript and JavaScript naming culture; that is the main limitation of the approach for other naming
cultures, which is why each conclusion records the vocabulary entry it used.

| Vocabulary                             | Default entries                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| containers (exact name)                | `app apps cmd domains feature features internal libs module modules packages pkg source sources src`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| shared (stemmed)                       | `base common config configuration constant core helper interface kernel lib misc setting shared support tool type util utility`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| directory → layer (stemmed key)        | `controller`→controller; `route router routing`→route; `handler`→handler; `resolver`→resolver; `middleware guard interceptor`→middleware; `view`→view; `page screen`→page; `component`→component; `presentation ui web http`→presentation; `api rest graphql endpoint`→api; `service`→service; `usecase use-case use_case interactor application`→application; `domain`→domain; `model entity`→model; `schema`→schema; `dto`→dto; `repository repo dao persistence`→repository; `db database`→database; `data`→data; `storage`→storage; `store`→store; `client`→client; `gateway`→gateway; `integration`→integration; `adapter`→adapter; `port`→port; `infrastructure infra`→infrastructure; `job worker task cron`→job; `hook`→hook; `listener subscriber consumer`→listener; `command cli`→command |
| naming suffix → role (stemmed)         | `controller`→`http-controller`; `route router`→`route-definition`; `middleware guard interceptor`→`middleware`; `service`→`service`; `repository repo`→`repository`; `entity model`→`data-model`; `dto`→`data-transfer-object`; `client`→`external-client`; `module`→`module-definition`; `store`→`state-store`; `page`→`ui-page`; `component`→`ui-component`                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| role → layer                           | `http-controller`→controller, `route-definition`→route, `middleware`→middleware, `service`→service, `repository`→repository, `data-model`→model, `data-transfer-object`→dto, `external-client`→client, `ui-page`→page, `ui-component`→component, `state-store`→store; `module-definition`, `configuration-provider`, `utility` and every `x-` role → no layer (⊥)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| generic tokens (stemmed; never a stem) | `abstract action adapter app base bootstrap client command common component config constant consumer container context controller core default dto effect entity enum error event exception factory filter fixture guard handler helper hook index init interceptor interface job listener log logger main mapper message middleware mock mod model module option page pipe provider query reducer repo repository request resolver response result route router saga schema selector server service setting setup shared slice spec store story style subscriber test type util validator view worker`                                                                                                                                                                                              |
| conventional tiers (outer → inner)     | 0: `page route` · 1: `api command controller handler job listener middleware presentation resolver view` · 2: `application component hook service store` · 3: `client domain gateway repository` · 4: `data database dto model schema storage` · no tier: `infrastructure adapter port integration`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

The naming-suffix keys never form a file stem; the directory-layer keys may (`task`, `data`, `api` can name
features).

### Configured names

Configured vocabulary names are normalized the way names are matched: ASCII-lower-cased; entries of
`shared_directories` and `generic_tokens` and the keys of `directory_layers` and `naming_suffixes` are then
S-stemmed; entries of `container_directories` are not stemmed. A list entry `!name` removes the default whose
normalized form equals the normalized `name`, so `!helpers` removes `helper`. Two names of one list or map
that normalize to the same name (`Services` and `services`) are a configuration error naming both. Layer
names (values of `directory_layers` and `role_layers`, entries of `conventional_tiers`) are kebab-case and
used as written.

## Components

**[DERIVED].** Components are physical units, derivable without judgement.

1. **Owned files** are the files whose role is in `inference.components.file_roles` (default `declaration`,
   `generated`, `script`, `source`, `test`), whatever their analysis status: a directory of unsupported
   files is still a unit. Configuration, documentation, assets, data, vendored and other files belong to no
   component.
2. A directory `d` is a **component** when its subtree holds an owned file and at least one of these holds:
   it is the analysis root `""`; it directly contains an owned file; it is a package root
   (`PackageEntity.path`); at least two of its child directories hold owned files (a branch point). A
   package root without owned files is therefore no component, and a chain of directories without files
   collapses into its deepest member.
3. `parent` is the nearest component above; `children` are sorted by id.
4. `kind` is `package` when a manifest is declared in the directory. **`name`**: the declared name of the
   package with the smallest id declared there; for an unnamed manifest, the repository name at the root and
   the directory name elsewhere; at the root without a manifest, the repository name; otherwise the path
   relative to the parent component, which is the directory name unless a chain was collapsed
   (`presentation/http` in clean-architecture). `packages`: the packages declared in the directory, else
   those of the nearest enclosing manifest directory, else none.
5. `files` are the owned files directly in the directory (every owned file belongs to exactly one
   component, the one of its own directory); `totals` sum files, `symbols.length` and `lines` over the
   subtree; `modules` lists the modules owning a file of the subtree; `dependencies` and `dependents` are
   aggregated over directly owned files on the metrics projection.

Monorepos need nothing special: package roots are components, and a package whose code lives in `src/` gives
a package component with no direct files and a `src` child whose totals summarize the package. Cost:
O(F · D) for F owned files of depth at most D.

## Architectural roles

**[KATEDRALA HEURISTIC].** Roles describe production code: only `source` files get roles and layer votes.
For each such file, votes are collected from four sources:

| Source        | Vote                                                                                             | Confidence | Evidence signal    | `RoleEntry` written                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ | ---------- | ------------------ | ---------------------------------------------------------------------------- |
| configuration | every `inference.roles.<role>` glob list matching the file                                       | 1.0        | `configured-glob`  | `{ role, source: "configuration" }`                                          |
| detector      | every existing role entry of another source (framework detectors, later milestones)              | its own    | —                  | kept as it is                                                                |
| naming        | the last qualifier whose S-stem is a naming suffix (`payment.controller.ts`)                     | 0.8        | `name-qualifier`   | `{ role, source: "naming" }`                                                 |
| naming        | the last token of a head of at least two tokens (`payment-controller.ts`; `dto.ts` is no suffix) | 0.6        | `name-suffix`      | same entry                                                                   |
| naming        | the last token of each exported top-level class name (`export class PaymentController`)          | 0.6        | `type-name-suffix` | same entry                                                                   |
| location      | the outermost layer-kind directory strictly below the source root                                | 0.7        | `directory-name`   | `{ role, source: "location" }`, only when exactly one role maps to its layer |

- **Combining votes.** A role entry's confidence is the maximum of its signals. A label's score combines
  sources by noisy-OR, `s(L) = 1 − Π_σ (1 − c_σ(L))`, where `c_σ(L)` is the strongest vote of source σ for L
  (each detector id is its own source); votes within one source are correlated observations of one naming
  convention and count once. The noisy-OR combination (Pearl 1988) is used as a scoring rule, not as a
  probability model. Example: `SqlBookRepository` in `infrastructure/persistence/sql-book-repository.ts`
  has a file-name and a class-name vote for `repository` (0.6, counted once) and a location vote for
  `infrastructure` (0.7): infrastructure wins, as the fixture expects.
- **Labels.** Each vote names a layer through `role_layers` (a role without a layer votes ⊥); a location vote
  names the directory's layer. The winning label has the highest score after rounding; ties go to the label
  whose strongest vote has the higher source precedence (configuration > detector > naming > location), then
  to ⊥ (no layer rather than a guess), then to the smaller name. A file's label is the winner when it is
  not ⊥ and its score is at least `min_label_score` (0.5).
- **Location votes** come from layer-kind directories only, so the kind precedence applies: a container such
  as `domains/` never votes, and in `src/domains/orders/controllers/x.ts` the vote comes from `controllers`.
  A package whose source root is itself a layer directory gets no location votes. Directories such as
  `domain`, `application` and `infrastructure` give layer votes but no role entry, because no role maps to
  their layer.
- **Idempotence.** Existing `naming`, `location` and `configuration` entries are replaced, never read as
  votes; running inference on its own output gives the same roles.
- **Limitations.** The vocabularies encode TypeScript and JavaScript naming culture. Documents without
  symbols (`detail.symbols: false`) have no class-name votes. Non-ASCII names are not case-folded.

## Modules

### Background [ESTABLISHED]

- **Clustering for architecture recovery.** Mancoridis et al. (1998) cast subsystem recovery as a search for
  the partition of the module dependency graph that maximizes Modularization Quality, which rewards
  intra-connectivity and penalizes inter-connectivity; Bunch (Mancoridis et al. 1999; Mitchell & Mancoridis 2006) searches it by hill climbing and genetic algorithms, sets _omnipresent_ modules (libraries used
  everywhere) aside and lets user constraints override the search. ACDC (Tzerpos & Holt 2000a) clusters for
  comprehension: it builds a skeleton from subsystem patterns, then attaches the remaining files, and gives
  clusters meaningful names. LIMBO (Andritsos & Tzerpos 2005) minimizes information loss and can weigh
  non-structural attributes such as file names.
- **Comparative studies.** Garcia, Ivkovic & Medvidovic (2013) compared six recovery techniques against
  eight verified architectures: ARC and ACDC routinely did best, but even the best had low accuracy.
  Lutellier et al. (2015, 2018) found that accurate dependencies have a major influence on recovery quality.
  Wu, Hassan & Holt (2005) compared six clustering algorithms across versions on stability, authoritativeness
  and the extremity of the cluster distribution, and concluded that automatic clustering needed significant
  improvement for evolving systems; Tzerpos & Holt (2000b) define stability as small output changes for
  small input changes.
- **Lexical signals.** Anquetil & Lethbridge (1999) cluster files by their names alone; Kuhn, Ducasse & Gîrba
  (2007) find that vocabulary topics mostly correspond to application concepts; Corazza et al. (2016) weigh
  lexical information for clustering. They support file-name stems as a prior, used with dependencies.
- **Community detection.** Modularity (Newman & Girvan 2004) with a resolution γ (Reichardt & Bornholdt 2006) is optimized by Louvain (Blondel et al. 2008), and has a resolution limit (Fortunato & Barthélemy
  2007). Louvain can return badly connected or disconnected communities. `@katedrala/graph.louvain` ends with
  a refinement that splits every community into its connected components, which guarantees connected
  communities only. Leiden (Traag, Waltman & van Eck 2019) guarantees more: γ-separated and γ-connected
  communities after every iteration, node optimality and subpartition γ-density once an iteration changes
  nothing, and uniform γ-density and subset optimality asymptotically. Inference does not rely on those
  guarantees (see [P4](#p4-oversized-directories)). Label propagation (Raghavan, Albert & Kumara 2007)
  assigns each node the label most frequent among its neighbours, iterated to a fixed point.
- **Comparing clusters.** Jaccard similarity of member sets, and conductance (Kannan, Vempala & Vetta 2004),
  which `internal-edge-ratio` complements.

### Rationale and stability under perturbation

The module view has to be faithful to developer intent where intent is visible, show where the logical
structure departs from the physical one (ADR-006), stay stable across commits (diff, history, rules) and be
explainable file by file. The milestone 5 design therefore rejected unconstrained modularity clustering for
module identity. Its prototype measurement on approximate graphs (import graphs from the fixtures'
`expected.json`, with barrels resolved) was the design-time motivation: unconstrained Louvain mixed
clean-architecture's layers into dependency-dense groups, cut every feature of tangled-architecture into
pieces of other features, and changed the module of 0.6 to 7.2 files on average per single-edge change.
Directories and file names are the strongest available statement of intent, and pattern-first recovery
(ACDC) did comparatively well; hence directories and naming stems form the **prior**, and dependency
evidence **overrides** it file by file only when it is unambiguous, with every override recorded as evidence.

**Measurements of this implementation** (`tests/fixtures/inference.test.ts`, on the linker graphs of all
fixtures, `KATEDRALA_REPORT=1`). Each case perturbs the document's edges, rebuilds the model and infers
again:

- _removal_: for every ordered pair of source files with edges, all IR edges of that pair are removed;
- _addition_: 40 seeded ordered pairs of source files without an edge get an `imports` edge (all such pairs
  when a fixture has fewer);
- _internal addition_: 40 seeded pairs inside one module get an `imports` edge.

"Module ids" counts the files whose module id differs, or whose module vanished, attached files included;
it is the asserted measure. "Matched" counts the files outside their matched module after a greedy
maximum-overlap matching of the modules (the design prototype's MoJo-like count), over source files; it is
the only meaningful count for Louvain, whose communities carry no identity. The Louvain column runs
unconstrained Louvain (γ = 1, from singletons) on the source files minus the composition roots and utilities
of the unperturbed inference, through the same harness. Cells give mean / maximum / share of unchanged cases.

| Fixture               | Perturbation      | Cases | Katedrala, module ids | Katedrala, matched | Louvain γ = 1, matched |
| --------------------- | ----------------- | ----- | --------------------- | ------------------ | ---------------------- |
| ambiguous-boundaries  | removal           | 63    | 0.06 / 1 / 94%        | 0.06 / 1 / 94%     | 0.60 / 5 / 78%         |
| ambiguous-boundaries  | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.85 / 5 / 70%         |
| ambiguous-boundaries  | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.72 / 4 / 80%         |
| circular-dependencies | removal           | 27    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.15 / 1 / 85%         |
| circular-dependencies | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.07 / 1 / 93%         |
| circular-dependencies | internal addition | 5     | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.00 / 0 / 100%        |
| clean-architecture    | removal           | 76    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 3.11 / 9 / 43%         |
| clean-architecture    | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 4.95 / 10 / 13%        |
| clean-architecture    | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 4.80 / 10 / 15%        |
| dependency-violations | removal           | 40    | 0.10 / 2 / 93%        | 0.07 / 1 / 93%     | 0.78 / 4 / 70%         |
| dependency-violations | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.70 / 5 / 65%         |
| dependency-violations | internal addition | 20    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.00 / 0 / 100%        |
| express-app           | removal           | 56    | 0.09 / 1 / 91%        | 0.09 / 1 / 91%     | 0.64 / 4 / 68%         |
| express-app           | addition          | 40    | 0.07 / 1 / 93%        | 0.07 / 1 / 93%     | 0.70 / 5 / 57%         |
| express-app           | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.85 / 4 / 57%         |
| fastify-app           | removal           | 31    | 0.32 / 1 / 68%        | 0.32 / 1 / 68%     | 0.19 / 1 / 81%         |
| fastify-app           | addition          | 40    | 0.35 / 2 / 70%        | 0.35 / 2 / 70%     | 0.40 / 3 / 78%         |
| fastify-app           | internal addition | 40    | 0.13 / 2 / 90%        | 0.13 / 2 / 90%     | 0.57 / 2 / 70%         |
| high-fan-in           | removal           | 70    | 0.16 / 3 / 90%        | 0.13 / 2 / 90%     | 1.29 / 7 / 69%         |
| high-fan-in           | addition          | 40    | 0.07 / 1 / 93%        | 0.07 / 1 / 93%     | 2.45 / 8 / 35%         |
| high-fan-in           | internal addition | 36    | 0.03 / 1 / 97%        | 0.03 / 1 / 97%     | 2.25 / 8 / 31%         |
| high-fan-out          | removal           | 38    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.39 / 2 / 66%         |
| high-fan-out          | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 1.20 / 4 / 38%         |
| high-fan-out          | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 1.00 / 3 / 40%         |
| javascript-commonjs   | removal           | 13    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.62 / 3 / 69%         |
| javascript-commonjs   | addition          | 40    | 0.10 / 3 / 95%        | 0.05 / 1 / 95%     | 0.85 / 3 / 30%         |
| javascript-commonjs   | internal addition | 10    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.80 / 2 / 40%         |
| layered-architecture  | removal           | 51    | 0.08 / 1 / 92%        | 0.08 / 1 / 92%     | 0.12 / 2 / 90%         |
| layered-architecture  | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.28 / 2 / 80%         |
| layered-architecture  | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.00 / 0 / 100%        |
| monorepo              | removal           | 43    | 0.12 / 2 / 93%        | 0.12 / 2 / 93%     | 0.93 / 7 / 60%         |
| monorepo              | addition          | 40    | 0.05 / 2 / 98%        | 0.05 / 2 / 98%     | 0.47 / 4 / 73%         |
| monorepo              | internal addition | 21    | 0.10 / 2 / 95%        | 0.10 / 2 / 95%     | 0.76 / 6 / 67%         |
| nestjs-app            | removal           | 40    | 0.07 / 1 / 93%        | 0.07 / 1 / 93%     | 0.35 / 3 / 83%         |
| nestjs-app            | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.47 / 3 / 65%         |
| nestjs-app            | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.20 / 3 / 90%         |
| simple-dependencies   | removal           | 5     | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.40 / 1 / 60%         |
| simple-dependencies   | addition          | 25    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.24 / 1 / 76%         |
| simple-dependencies   | internal addition | 6     | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.67 / 1 / 33%         |
| tangled-architecture  | removal           | 107   | 0.01 / 1 / 99%        | 0.01 / 1 / 99%     | 1.39 / 9 / 70%         |
| tangled-architecture  | addition          | 40    | 0.05 / 1 / 95%        | 0.05 / 1 / 95%     | 1.02 / 4 / 70%         |
| tangled-architecture  | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 1.32 / 9 / 63%         |
| typescript-features   | removal           | 47    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.21 / 2 / 81%         |
| typescript-features   | addition          | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.38 / 3 / 75%         |
| typescript-features   | internal addition | 40    | 0.00 / 0 / 100%       | 0.00 / 0 / 100%    | 0.33 / 2 / 73%         |

The test asserts that no case changes the module of more than two files. **Three cases change three files**;
they are analysed here and listed in the test, which fails on any other case above the bound:

- high-fan-in, removal of `jobs/email-digest.job.ts → services/email.service.ts`, and likewise of
  `jobs/inventory-sync.job.ts → services/inventory.service.ts`: the edge was the only connection of a
  two-file stem group, so the stem module (`mod:src#email`, `mod:src#inventory`) is no longer kept (P2 keeps
  connected stem components only) and both files return to their layer-directory modules. The third file is
  `services/payment.service.ts`: it had been absorbed into `mod:src#order` because it was the only file left
  in `src/services` (condition 4's lone-file exception); once a stem file returns to `src/services`, it is no
  longer alone and stays there.
- javascript-commonjs, addition of `views/todo-page.js → services/todo-service.js`: the new edge connects the
  `todo` stem across two layer directories, coverage 2 of 6 reaches the threshold, and the two files form
  `mod:src#todo`; `views/layout.jsx`, now alone in `src/views`, is absorbed by the lone-file exception.

In all three, a stem group of two files appears or disappears, which changes those two files by
construction, and the lone-file exception of condition 4 then moves one more file. This non-locality is
known (the P2 connectivity requirement and the cascades of condition 4 are deliberately non-local); the
alternative for condition 4, applying the lone-file exception only to units that were singletons in the
prior, would keep one-file modules with a cycle back to the module they serve, and explains less. The other measurements show the intended behaviour: the median case changes nothing, and Louvain changes more
files than prior-anchored inference in almost every row, often several times more (clean-architecture: three
to five files per case, against none). fastify-app is the exception for removals and additions: a small
fixture whose three singleton directories are absorbed through single edges.

### Overview

```text
declared modules: exact glob membership (D-22, D-23)
for each scope (a package, or "" for files outside packages), in id order:
  P0  nodes: the scope's files with a node role, minus declared-module files; the weighted graph
  P1  prior units: source root, container splitting, directory units, size cap
  P2  organization style per split directory; stem units for layer-organized groups
  P3  structural classes on the prior: utilities, composition roots, barrels
  P4  oversized flat units split with Louvain (warm start: stems), small pieces merged
  P5  strict-majority reassignment of unpinned files
  P6  identity: anchors, keys, names; empty units dropped
then, over all scopes:
  P7  tests and declarations attached for navigation
  P8  entry points, public API, packages
  P9  confidence and evidence
```

### P0: scopes and nodes

Every file belongs to the scope of its package (`FileEntity.package`, the nearest enclosing manifest), or
to the scope `""`. Inferred modules never span scopes: cross-package structure is the package view's job,
and a change in one package cannot change another package's modules. The nodes are the files whose role is in
`inference.modules.file_roles` (default `source`) that no declared module owns; one weighted graph is built
over all nodes and restricted to each scope, so P1–P9 never see an edge to another package. Files whose
analysis failed or was skipped keep their role and are nodes without edges: they stay in their prior unit.
Module inference is skipped when `inference.modules.enabled` is false, or when `when_declared` is `none` and
a module is declared; declared modules are produced in every case.

### P1: prior units

From the source root `r`, a directory `d` is **split** when `d = r`, or `d` is a container, or its subtree
holds more than `max_module_files` (120) nodes while a child directory holds nodes.

- Not split: one **directory unit** with every node of the subtree; its kind is the directory's kind
  (feature, layer or shared).
- Split: the nodes directly in `d` form a unit keyed `d`, whose kind is `root` when `d = r`, `shared` when
  `d` is a container, and the directory's own kind otherwise (the loose files of a feature directory split
  by the size cap stay a feature unit, not a pinned shared one); then each child with nodes is visited in
  path order.

Features are conventionally the children of the source root or of container directories
(`src/features/*`, `packages/*/src/modules/*`); deeper directories are a feature's internal structure; the
size cap keeps modules at a granularity people can reason about. Limitations: the cap is a threshold (a
directory growing from 120 to 121 nodes splits into its children; diff pairs modules by member similarity),
and a feature directory named like a shared directory (`core/` holding a domain core) is shared unless the
vocabulary is configured.

### P2: organization style and stem units

For every split directory `d`, in path order, the child directories with nodes are classified into layer
(`L`), feature (`F`) and shared (`S`) children; containers count in none. The **style** is `layer` when
`|L| ≥ 2` (`mixed` when also `|F| ≥ 1`), `feature` when `|L| ≤ 1` and `|F| ≥ 1`, and `none` otherwise (one
layer directory and no feature directory, as in simple-dependencies).

When `|L| ≥ 2`, every node below a layer child `c` gets a stem: the S-stemmed name `s` of the
sub-directory it lies in directly below `c` when `s` is not a generic token and occurs directly below at
least two layer children (`controllers/payment/x.ts` and `services/payment/y.ts` give `payment`); otherwise
its file stem. Per stem, the connected components of the stem's files (over the scope graph, undirected)
that span at least two layer children are kept, and their union forms the stem's files: every kept
component is connected and spans two layer directories, and weak cohesion of a union shows in
`internal-edge-ratio`. `coverage` is the share of the nodes below layer children that belong to a kept
stem. When at least one stem is kept and `coverage ≥ stem_min_coverage` (0.25), the stems are applied in
stem order: their files leave their units and join the feature child of `d` whose stemmed name equals the
stem (the smallest path when several do; a feature child that P1 had split by size and that has no loose
files of its own gets a feature unit for this), or else a new **stem unit** `d#stem`.

The connectivity requirement keeps coincidental names apart: in clean-architecture `loan` occurs in
`domain/model/loan.ts`, `domain/ports/loan-repository.ts` and `presentation/http/loan-routes.ts`, but the
route file depends on neither domain file directly, so no `loan` module is formed and the layer directories
stay modules.

### P3: structural classes

On the prior (the units after P2):

- **Utilities** (after Bunch's omnipresent modules): a file whose dependents lie in at least
  `utility_min_modules` (3) prior units other than its own, or at least 2 when its own unit is shared or
  root. A first pass counts every dependent; the final count ignores composition roots as dependents.
- **Composition roots** (orchestrators), a monotone fixpoint computed with a worklist (it equals the
  prototype's repeated passes): a file that is not a first-pass utility is a composition root by the
  **entry-point rule** when it is a declared entry point (a file, or a symbol of it, named by any
  `EntryPointEntry`) and only composition roots depend on it, or by the **shape rule** when (i) only
  composition roots outside its own unit depend on it, (ii) its dependencies on non-utilities reach at least
  two other units, (iii) no unit receives more than 50% of that weight and (iv) its own unit receives at
  most 25%. The rule recorded is the one that holds once the set is final, the entry-point rule first; the
  order in which files become composition roots does not matter.
- **Barrels** (facades): files with at least one admitted dependency of which at least half carry the
  `re-exports` kind.

Composition roots and utilities are **pinned** (they stay in their prior unit) and **excluded from
evidence** (their edges neither vote nor count in cohesion): a composition root imports every feature and
would pull features together; a logger used everywhere would glue all modules into one. Barrels are pinned to
the directory they front, but their edges remain evidence. Files of shared units are pinned too: putting a
file into `shared/` is a statement of intent, and grab-bag directories are reported through evidence
(`shared-usage`, `single-user-files`) instead. On the linker graph these classes are broader than on import
graphs: package barrels (`src/index.ts`) are declared entry points and composition roots, and calls through a
dependency-injection container make it a utility; their evidence wording says which rule applied.

### P4: oversized directories

A directory, root or shared unit with more than `max_module_files` nodes after P2 (its nodes lie directly in
one directory) is split; stem units are not. Composition roots and utilities are set aside, and on the
remaining nodes' undirected subgraph Louvain runs with pinned parameters (`resolution` 1, `maxLevels`
unlimited, `maxPasses` 1000, `minModularityGain` 1e-12, `minPassGain` 1e-7: a change of the graph package's
defaults cannot change module ids), warm-started with the file-stem labels (stemless files start as
singletons). Its final refinement makes every piece connected. Pieces with fewer than `min_module_files` (3)
nodes then merge, in rounds, into the piece they share the most weight with (ties: the smaller piece); every
small piece with an edge points to its best neighbour and each connected group of pointers merges, which is
order-independent and terminates. Small pieces without edges to other pieces, together with the composition
roots and utilities set aside, form the **remainder**, which keeps the unit's key, kind and destination flag.

Keys: pieces are visited by decreasing size, then smallest member, and each takes its most frequent stem not
yet taken (ties: the smallest), starting from the stems P2 used in the same directory. A piece without an
available stem takes the hyphen-joined token keys of its smallest member's file name, extension included
(`formatDate.ts` → `format-date-ts`), and when that is taken as well, 16 hex digits of the SHA-256 of that
member's path. Keys never depend on processing order. Louvain only splits a single directory's subgraph,
where the resolution limit matters less; the pieces are reported as evidence (`oversized-directory`).

### P5: strict-majority reassignment

Passes visit the unpinned nodes in id order. For a file `f` in unit `P`, with `in_U` the weight of its
dependents in unit `U`, `out_U` that of its dependencies, `support_U` the number of distinct dependents in
`U`, and `C` the unit with the largest `in_U` (ties: the smallest key), `f` moves to `C` when all five hold:

1. `C ≠ P` and `C` is a destination: a feature, stem or split-piece unit (never a layer-directory, shared or
   root unit: those are not logical destinations);
2. `in_C > 0.5 · Σ_U in_U`: a strict majority of the evidence of its users;
3. `in_C ≥ move_min_weight` (1.0: one runtime dependent, or two type-only ones);
4. `support_C ≥ move_min_support` (2), or `≥ 1` when `P` currently holds `f` alone (a lone file cannot be
   held by its own unit);
5. `Σ_U out_U = 0`, or `out_C > 0.5 · Σ_U out_U`: it also mostly depends on `C`.

Assignments update immediately; passes repeat until one moves nothing, at most `max_passes` (50). A scope
that stops at the limit with moves pending gets a `limit-reached` info diagnostic. This is a constrained,
deterministic relative of label propagation: the label is the module, the prior is the initial labelling,
and the strict-majority, support and two-sided conditions move a file only on unambiguous evidence.
Conditions 2 and 5 implement the fixtures' definition of "mostly". Condition 4 uses the unit's current
size, so it absorbs singleton prior units into the module they serve, and can cascade: in monorepo's
`@acme/core`, `catalog/product.ts` moves to `orders` (2 of its 3 dependents are there), then
`catalog/catalog.ts` is alone and follows (1 of 1), and the `catalog` module disappears. Every move is a
strict majority and is reported as `relocated-files` evidence with the in- and out-weights of the file's last
move; a file that moved away and back reports nothing.

Worked example (ambiguous-boundaries, `src/catalog/price-calculator.ts`; `server.ts` is a composition root
and `common/format.ts` a utility, so neither votes): dependents `catalog` 1.0 (1 file) and `checkout` 3.0 (3
files); dependencies `checkout` 2.0. `3.0 > 0.5 × 4.0`, `3.0 ≥ 1.0`, support 3 ≥ 2, `2.0 > 0.5 × 2.0`: it
moves to checkout.

### P6: identity

Identity derives from the **prior**, never from the final membership, so files moving in or out never
change a module id. Empty units are dropped. Keys follow `inferredModuleKey` (IR.md, "Identifiers"):
`mod:<directory>` or `mod:<directory>#<stem>`, the analysis root written `.`, and `~inferred` appended when a
key equals a declared module's name. Names:

- directory, layer and shared units: the last segment of the anchor directory;
- root units: the last segment of the source root when it is neither a container nor the package directory
  (a meaningful directory such as `lib`); otherwise the scope package's declared name without its npm scope
  (`@acme/api` → `api`), for an unnamed manifest the package directory's name (the repository name at the
  root), and without a package the repository name;
- stem units: when a member has the layer label `model` or `domain` (or a `data-model` role) and its head is
  a single token whose stem is the module's stem, the plural of that token (`models/payment.ts` →
  `payments`), or the token itself when it is already plural; otherwise the most frequent original first
  token among the members (ties: the smallest), for example `refund`; a stem taken from a sub-directory
  keeps the sub-directory's spelling. Labels come from the roles stage before layer pruning, so names do not
  depend on the global layer count;
- split pieces: the most frequent original spelling of the stem; for a fallback key, the smallest member's
  file name without its extension.

Display names may repeat (`orders` in two packages); consumers disambiguate by id.

### P7: tests and declarations

Tests and declarations never influence inference, but people expect `payment.service.spec.ts` next to its
module. Each test (when `attach_tests`) and each declaration (when `attach_declarations`) that is neither a
node nor a declared member is considered in id order:

1. The candidates are the distinct files it depends on (a test) or that depend on it (a declaration) that
   are members of any module: declared or inferred, of any scope, attached files excluded.
2. If one module holds a strict majority of the candidates, the file is attached to it when it is an inferred
   module of the file's own scope; otherwise it stays unassigned.
3. Without a majority, a file falls back on **location** only when its role is outside the metrics
   projection: tests, unless `analysis.include_tests_in_metrics` counts them. Declarations are always in the
   metrics projection and stay unassigned. Location: the inferred module of the file's scope with the most
   nodes directly in the file's directory (ties: the smallest id), then likewise for each ancestor up to the
   scope directory.

Attached files are listed in `ModuleEntity.files` for navigation; they count in no module size, confidence,
`publicApi` or layer. Aggregated dependencies run on the metrics projection, which includes declarations
(and tests with `include_tests_in_metrics`), so an attached declaration takes part in module dependencies:
that is why such files are attached by strict majority only, which keeps most of their edges inside the
module. typescript-features' `globals.d.ts` has one dependent in each of two modules and stays unassigned;
by location it would have joined the root module and turned `ui/OrderList.tsx`'s reference into a
`mod:src/ui → mod:src` dependency. Every module with attached files gets `attached-files` evidence that
counts them by role and rule.

### P8: entry points, public API, packages

- `entryPoints`: for inferred modules, members named `index.*` directly in the anchor directory plus barrels
  directly in it; for declared modules, the members matching the configured `entry` globs, or, without
  `entry`, the same rule in the common directory of the members whose role is a node role (so that tests in
  `test/` do not move it to the root). Stem modules usually have none.
- `publicApi`: the node members that are the target of an `imports` or `re-exports` edge from a member (node
  or attached) of another module, admitted by the metrics projection's file roles and type-only setting. It
  is the actual surface the IR defines ("files that files of other modules import or re-export from"): the
  linker also lifts calls and type references through barrels to the declaring file, which would list a
  port behind a barrel as public (`src/domain/ports/member-repository.ts` in clean-architecture is reached
  only through `src/domain/index.ts`). Sources in no module do not count. A difference between `publicApi`
  and `entryPoints` shows deep imports, which milestone 7 compares.
- `packages`: the packages of all member files, attached files included.

### P9: confidence and evidence

Signals are computed per scope on the evidence graph (the scope graph without the edges of composition roots
and utilities), over node members. `n` is the number of node members.

| Signal                | Kinds                       | Definition                                                                                                                                                                                                                                       |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `internal-edge-ratio` | feature, stem, split, layer | `2·W_in / (2·W_in + W_cut)`: `W_in` the undirected weight inside the module, `W_cut` the weight between members and other nodes; 1 − conductance when the module is the smaller side (Kannan et al. 2004). Absent without evidence edges.        |
| `membership-margin`   | feature, stem, split        | mean over members with evidence of `max(0, own − best other)`, shares over the member's dependents grouped by module (over its dependencies when it has no dependents). A member whose own weight does not exceed the best other is _contested_. |
| `prior-agreement`     | all                         | Jaccard similarity of the members and the prior's members                                                                                                                                                                                        |
| `module-size`         | all                         | `n / (n + 2)`: 1 file 0.33, 5 files 0.71, 20 files 0.91                                                                                                                                                                                          |
| `shared-usage`        | shared                      | share of members whose dependents lie in at least two other modules, composition roots ignored and utilities kept                                                                                                                                |
| `wiring-share`        | root                        | share of members that are composition roots, barrels or declared entry points, each counted once                                                                                                                                                 |

| Kind                       | Weights                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| feature, stem, split piece | internal-edge-ratio 0.40, membership-margin 0.25, prior-agreement 0.20, module-size 0.15 |
| layer directory            | internal-edge-ratio 0.50, prior-agreement 0.30, module-size 0.20                         |
| shared                     | shared-usage 0.50, prior-agreement 0.30, module-size 0.20                                |
| root                       | wiring-share 0.30, prior-agreement 0.50, module-size 0.20                                |

`confidence = Σ weight × value`. A signal that cannot be computed is still listed, with its weight and no
value, and contributes 0, with a description of why ("No member file has dependency evidence in its
package"): a directory whose files do not depend on each other has no structural support, and its confidence
shows it (`src/plugins` of javascript-commonjs: 0.275). Each kind keeps a fixed set of weighted signals whose
weights sum to 1. Rationale: cohesion is the primary structural property of a module; the margin captures how
unambiguous each membership is; agreement between dependency evidence and the developers' own structure is
independent corroboration; tiny modules carry little evidence. Limitations: the weights are judgement, not
fitted against a ground-truth corpus; values are comparable across snapshots and repositories because no
term is normalized by a snapshot maximum, but they are not probabilities.

### Declared modules and rules

Declared modules (the `modules` section) have exact membership: the files their globs match whose role is in
`inference.components.file_roles` (code, tests and declarations, never manifests or documentation). Overlaps
resolve by **module name**: a file several declared modules match belongs to the one whose name sorts first,
and one `configuration-warning` per pair names both modules, the rule, the number of files and the first
paths (at most `limits.maxEvidenceEntities`). Configuration key order therefore never carries meaning, the
canonical configuration JSON in `analysisDigest` describes the configuration completely, and a formatter that
sorts YAML keys changes nothing. A declared module that matches nothing is kept with no files and a warning.
Declared files are not inference nodes: inferred modules never contain them, and an undeclared file used
only by a declared module is not pulled into it.

**Requirement for the rules engine.** Module selectors and `scope: modules` must match declared modules
unless a rule opts in (`include_inferred: true`): rule violations are a contract with the user and must not
depend on heuristics. dependency-violations shows why: with `payments` and `analytics` declared, inference
forms the stem modules `customers`, `orders` and `refund`, and `customer.controller.ts` uses
`order.service.ts`, which uses `customer.service.ts`, so the inferred modules form a genuine cycle. Its rule
`no-module-cycles` expects 0 violations, which holds over the declared modules (whose only dependency is
`payments → analytics`); the inferred cycle stays visible as an observation. Milestone 8 defines rule
semantics in `docs/RULES.md`.

### Module kinds and their signals

The IR has no module kind; one context signal per kind makes it explicit, with the anchor directory as
entity:

| Kind                            | Kind signal         | Weighted signals                                                     | Typical context signals                                   |
| ------------------------------- | ------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| feature directory               | `feature-directory` | internal-edge-ratio, membership-margin, prior-agreement, module-size | `organization-style`, `relocated-files`, `attached-files` |
| stem module                     | `file-stem`         | as feature                                                           | `organization-style`, `relocated-files`                   |
| piece of an oversized directory | `split-piece`       | as feature                                                           | `oversized-directory`                                     |
| layer directory                 | `layer-directory`   | internal-edge-ratio, prior-agreement, module-size                    | `organization-style`                                      |
| shared directory                | `shared-directory`  | shared-usage, prior-agreement, module-size                           | `single-user-files`, `utility-files`                      |
| root files                      | `root-files`        | wiring-share, prior-agreement, module-size                           | `composition-roots`, `facade-files`                       |

## Layers

### Background [ESTABLISHED]

- **Levelization** (Lakos 1996): with acyclic physical dependencies, a component's level is one more than the
  highest level it depends on (a longest-path layering); cycles must be broken first.
- **Layer recovery.** Sarkar, Maskeri & Ramachandran (2009) discover layers from source code and measure
  layering violations; Laval et al. (2013, oZone) identify layers in the presence of cycles by breaking them
  at the dependencies most likely to be violations.
- **Feedback arc sets.** Making a directed graph acyclic by removing a minimum set of arcs is NP-complete
  (Karp 1972). Eades, Lin & Smyth (1993) give a fast greedy heuristic. For a handful of layers, the subset
  dynamic programme for vertex-ordering problems (Bodlaender, Fomin, Koster, Kratsch & Thilikos 2012) finds
  an optimal order exactly in O(2^k · k²).
- **The Dependency Rule** of Clean Architecture (Martin 2017): source dependencies point inwards, toward
  higher-level policy.

### Membership and pruning

**[KATEDRALA HEURISTIC].** The members of layer `L` are the `source` files whose label (see
[Architectural roles](#architectural-roles)) is `L`, in any module, declared or not: layers are orthogonal to
modules, and tests and declarations never get a layer. A label keeps its layer when it has at least
`min_layer_files` (2) members, or one member with a location, configuration or detector vote for it: a
deliberate `routes/` directory with one file is a layer, a stray `x.controller.ts` is not. With fewer than two
layers left there are none. Files of shared directories and composition roots usually have no votes and
therefore no layer.

### The layer graph

Nodes are the layers, sorted by name. The arc weight `w(A, B)` sums, over the distinct file pairs from a file
of `A` to a file of `B`, the weights of the weighted file graph on all `source` files (the module weighting:
1 runtime, `type_only_weight` type-only, `min_edge_confidence` applied). Layer ordering is inferred from
evidence, so type-only references always count at `type_only_weight`, also when `analysis.include_type_only`
is false; `LayerEntity.dependencies` follow the metrics projection and then omit them. Evidence descriptions
therefore state the type-only share of a weight.

### Order: exact, greedy, conventional

1. The strongly connected sets of the layer graph are found. Each one with `k ≤ exact_order_max_layers` (12)
   layers is ordered exactly: with the layers numbered by name, `best(S) = min over a ∈ S of cost(a, P) +
best(S \ {a})` for the set `S` still to place after `P`, where `cost(a, P)` is the pair (weight of the arcs
   from `a` back to already placed layers, number of already placed layers with a conventional tier higher
   than `a`'s). Pairs compare lexicographically, so the backward weight is minimized first and tier
   inversions break ties; layers without a tier never count as inversions. The order taking the smallest
   attaining layer at each step is the lexicographically smallest optimal one. Larger sets use the greedy
   feedback arc set (unweighted, a documented approximation). The arcs against the order are the **upward
   dependencies**.
2. **Conventional arcs** order layers that no observed path connects: pairs `(A, B)` with
   `tier(A) < tier(B)` that share a package (a package with members of both; files without a package share
   the package `""`) are processed by `(tier(A), tier(B), A, B)`, and `A → B` is added with weight 0 when
   neither reaches the other in the graph as it grows. They never create a cycle. `infrastructure`,
   `adapter`, `port` and `integration` have no tier: their direction differs between classic layering and
   ports and adapters, so only observed dependencies place them.

### Ranks: classic and clean architecture

`rank` is the length of the longest path from a layer nothing depends on, over the observed arcs without the
upward ones plus the conventional arcs: Lakos levelization counted from the top. Dependencies are expected to
point to higher ranks. In classic layering (controller → service → repository → model) the data layer gets
the highest rank; in clean or hexagonal architecture the domain does, and every adapter ring that nothing
depends on (presentation and infrastructure) gets rank 0. Counting from the top is what puts infrastructure
in the outer ring with presentation instead of next to the use cases. An upward dependency is a dependency
toward a lower rank in both styles, so the Dependency Rule and the classic layering rule are the same check.

### Confidence and evidence

| Signal                  | Weight | Definition                                                                                                                                                                                                          |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `label-agreement`       | 0.35   | mean winning label score of the members                                                                                                                                                                             |
| `direction-consistency` | 0.35   | share of the layer's incident cross-layer weight that follows the order (outgoing to a higher rank, incoming from a lower rank); equal ranks and upward arcs do not follow; absent without cross-layer dependencies |
| `order-support`         | 0.20   | share of the other layers comparable with this one through observed paths without upward arcs (conventional arcs do not count)                                                                                      |
| `layer-size`            | 0.10   | `n / (n + 2)`                                                                                                                                                                                                       |

Absent signals contribute 0. Context signals: `role-sources` (members per combination of vote sources),
`upward-dependencies` (on the depending layer of each upward arc: weight, type-only share, depending files),
`conventional-order` (on both layers of a conventional arc) and `misplaced-by-name` (members whose naming
vote names another layer than their location vote). Worked example (layered-architecture,
`layer:controller`): three files with a location vote 0.7 and a `.controller` qualifier 0.8 score
`1 − 0.3 × 0.2 = 0.94`; all incident weight goes out to `service`: 1.0; all three other layers are comparable
through observed paths: 1.0; size 3/5 = 0.6; `0.35 × 0.94 + 0.35 × 1 + 0.20 × 1 + 0.10 × 0.6 = 0.939`.

### Declared layers and monorepos

Declared layers (the `layers` section, outermost first) disable layer inference: members are the `source`
files their globs match, the first layer in list order keeps a file several match (with a
`configuration-warning`), a layer matching no source file is kept empty with a warning, and ranks are the
configured `rank` or the list position (ties allowed). Monorepos have one global set of layers
(`layer:<name>`); conventional arcs need a shared package, so layers of unrelated packages stay at rank 0
with low `order-support` (monorepo: `component` and `handler`, confidence 0.295), which is honest about the
missing evidence.

## Evidence and explanation

### Method strings

`InferenceInfo.method` is `katedrala/module-inference@1` or `katedrala/layer-inference@1`, followed by `?` and
the parameters whose effective value differs from the default, as `key=value` pairs joined by `&`, keys
sorted by UTF-16 code units (IR.md, "Inference methods"). Keys of the method's own section are bare; keys of
other `inference` sections carry their path relative to `inference`; the core setting carries its full
path. Scalars are written as they are; lists and maps as `h:` and 8 hex digits of the SHA-256 of their
canonical JSON (sets as sorted arrays, maps as objects), so equal effective values give equal strings
however they were written.

| Method | Parameters                                                | Why                                                                                                           |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| module | `inference.modules.*`                                     | every module parameter                                                                                        |
| module | `layers.directory_layers`, `layers.naming_suffixes`       | directory kinds (P1, P2, P5 destinations) depend on the layer keys; file stems exclude the naming-suffix keys |
| module | `components.file_roles`                                   | it filters declared membership, which decides the nodes                                                       |
| module | `analysis.include_tests_in_metrics`                       | it decides whether tests without a majority are attached by location                                          |
| layer  | `inference.layers.*`, `roles`                             | every layer parameter, and the configured roles that vote                                                     |
| layer  | `modules.type_only_weight`, `modules.min_edge_confidence` | the layer graph uses the module weighting                                                                     |
| layer  | `modules.container_directories`                           | containers decide location votes                                                                              |

Declarations (`modules`, `layers`) are inputs, not parameters: diff compares declared modules and layers
directly. `analysis.include_type_only` changes only `publicApi` and aggregated dependencies, which follow the
metrics projection recorded in `metrics.projection` (milestone 6), and enters no method. `roles`,
`role_layers` and `min_label_score` reach modules only through stem _names_, never ids, memberships or
confidences, and enter no module method. A test checks for every key that a value changing ids,
memberships, ranks or confidences also changes the method string. An algorithm change that changes results
at default settings increments the version (`@2`).

### Evidence order, rounding, entities

`confidence = Σ weight × value` is computed from unrounded values, then every value, weight and the
confidence are rounded. Evidence is ordered totally: weighted signals by decreasing `weight × value` (an
absent value counts 0), then by `signal`; then context signals by `signal`, `description`, `value` (absent
first) and `entities` element by element. Each `entities` list is sorted and truncated to
`limits.maxEvidenceEntities`; descriptions that list files are bounded the same way. `relocated-files` has at
most `limits.maxEvidenceEntities` entries per module, for the smallest file ids, and a
`relocated-files-omitted` entry counts the others.

### Signal catalogue

Module signals (examples from the fixtures):

| Signal                    | Value                                  | Entities            | Example description                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal-edge-ratio`     | ratio                                  | —                   | "82% of the dependency weight of member files stays inside the module (internal 7.0, crossing 3.0)."                                                                                                                                                                                                                      |
| `membership-margin`       | mean margin                            | contested members   | "On average, member files are 83 percentage points more connected to this module than to any other; no member is contested."                                                                                                                                                                                              |
| `prior-agreement`         | Jaccard                                | relocated files     | "The members match directory `src/catalog` except 2 relocated files (Jaccard 0.75)."                                                                                                                                                                                                                                      |
| `module-size`             | `n/(n+2)`                              | —                   | "The module has 5 member files."                                                                                                                                                                                                                                                                                          |
| `shared-usage`            | share                                  | shared files        | "1 of 4 files is used by two or more other modules (composition roots do not count as users)."                                                                                                                                                                                                                            |
| `wiring-share`            | share                                  | those files         | "Its only member file is a composition root, barrel or declared entry point."                                                                                                                                                                                                                                             |
| kind signals              | —                                      | anchor directory    | "Inferred from the feature directory `src/cart`." / "Inferred from the file-name stem `customer`, which recurs across the layer directories of `src`."                                                                                                                                                                    |
| `organization-style`      | stem coverage, with ≥ 2 layer children | classified children | "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 4 layer directories (controllers, models, repositories and services) and 1 shared directory (shared), so it is organized by layer; file-name stems order, payment and user recur across its layer directories and cover 14 of 14 files." |
| `relocated-files`         | share of the dependents' weight here   | the file            | "Reassigned here by the strict-majority rule (Katedrala heuristic): `src/catalog/price-calculator.ts` has 3 of its 4 dependents (weight 3.0 of 4.0) and all of its dependencies (2.0 of 2.0) in this module." A lone file adds "it was the only file left in `src/clients`, so one dependent suffices."                   |
| `relocated-files-omitted` | count                                  | —                   | "4 further files were reassigned here; entries are limited by limits.maxEvidenceEntities."                                                                                                                                                                                                                                |
| `single-user-files`       | count                                  | those files         | "3 files are used by only one other module: session (cart), slug (catalog) and validation (checkout)."                                                                                                                                                                                                                    |
| `composition-roots`       | count                                  | those files         | "Treated as a composition root by the orchestrator rules (Katedrala heuristic) and not counted as evidence: `src/server.ts` (entry-point rule: a declared entry point that nothing in its package depends on)."                                                                                                           |
| `utility-files`           | count                                  | those files         | "Treated as a shared utility by the utility rule (Katedrala heuristic), pinned and not counted as evidence: `src/common/format.ts` (its dependents lie in 3 other units)."                                                                                                                                                |
| `facade-files`            | count                                  | those files         | "Treated as a barrel by the facade rule (Katedrala heuristic) and pinned to its directory: `src/index.ts` (5 of its 6 dependencies are re-exports)."                                                                                                                                                                      |
| `attached-files`          | count                                  | the attached files  | "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 0 by a strict majority of the modules they depend on, 1 by location in `src/orders`."                                                                                                                                                |
| `oversized-directory`     | node count                             | the directory       | "Part of the oversized directory `src/lib` (420 files), grouped by dependencies."                                                                                                                                                                                                                                         |
| `anchor-drift`            | share                                  | —                   | "Only 40% of member files lie under the anchor directory `src/x`." (only below 50%)                                                                                                                                                                                                                                       |

Layer signals: `label-agreement`, `direction-consistency`, `order-support`, `layer-size` (weighted), and
`role-sources` ("2 members by location and naming, 1 by location only."), `upward-dependencies` ("2 file
dependencies (weight 1.5, of which 0.5 type-only) point from `repository` to `service`, against the inferred
order."), `conventional-order` ("Placed before `database` by the conventional tier order (Katedrala
heuristic): no observed dependency path connects them.") and `misplaced-by-name`.

Role evidence, one entry per signal of a `RoleEntry`, its value the vote's confidence: `name-qualifier`
("Naming rule (Katedrala heuristic): the file name `customer.controller.ts` has the qualifier `controller`,
which the naming vocabulary maps to `http-controller`."), `name-suffix`, `type-name-suffix` ("... the exported
class `CartService` ends with the word `service` ..."), `directory-name` ("Location rule (Katedrala
heuristic): the file lies in `src/controllers`, which the directory vocabulary maps to the layer
`controller`.") and `configured-glob` ("The file matches `inference.roles.http-controller`.").

### Reasons

Every reason is one sentence that begins with "Inferred:":

- stem module: "Inferred: files with the name stem `customer` in 4 layer directories of `src` form a
  connected group; 75% of their dependency weight stays inside." (a union of components "form 2 connected
  groups");
- directory module: "Inferred: directory `src/catalog` with 1 file reassigned in and 1 out; 83% of the
  dependency weight stays inside.";
- layer directory: "Inferred: layer directory `src/domain` in a layer-organized source tree; no file-name
  stem recurs across its layers." (or "the only layer directory in `src`");
- shared module: "Inferred: shared directory `src/common`; 1 of 4 files is used by two or more other
  modules.";
- root module: "Inferred: the top-level files of `src` (9 files); 2 are treated as composition roots,
  barrels or declared entry points.";
- split piece: "Inferred: part of the oversized directory `src/lib` (420 files), grouped by dependencies
  around the stem `format`."; remainder: "... the 12 files that joined no piece stay here.";
- layer: "Inferred: `src/controllers` holds 3 files named `*.controller.ts`; no other layer depends on it and
  it depends on `service` (rank 0)."

When `internal-edge-ratio` is absent, the "% stays inside" clause says that no member has dependency evidence
in its package.

### Verifying a confidence by hand

Take the weighted entries of `evidence`: their weights sum to 1, and `Σ weight × value` (an absent value
counting 0) equals `confidence` within 1e-8. For layered-architecture's `mod:src#payment` (evidence graph
without `main.ts` and the four shared utilities): `internal-edge-ratio` 9.0 / 12.0 = 0.750 × 0.40 = 0.300;
`membership-margin` (1 + 1 + 1 + 1 + 0) / 5 = 0.800 × 0.25 = 0.200 (`payment.service.ts` is used by
`payments` and `orders` with weight 1.0 each: margin 0, contested); `prior-agreement` 5/5 = 1.000 × 0.20 =
0.200; `module-size` 5/7 = 0.714 × 0.15 = 0.107; confidence 0.807.

## Configuration reference

Keys are snake_case. The `modules`, `layers` and `inference` sections are validated by `@katedrala/engine`
(ADR-013); validators never inject defaults, and unknown keys are errors with a "did you mean" suggestion.
Module, layer and role glob lists use core's glob semantics (picomatch, relative to the analysis root,
dotfiles included, `!pattern` excludes for the whole list) and need at least one pattern that is not an
exclusion, since an exclusion-only list would claim every other file.

```yaml
modules: # declared modules
  payments: ["src/payments/**"] # short form: file globs
  analytics: # long form
    files: ["src/analytics/**"]
    entry: ["src/analytics/index.ts"]
layers: # declared layers, outermost first (disables layer inference)
  - name: controller
    files: ["src/controllers/**"]
  - name: service
    files: ["src/services/**"]
    rank: 1 # optional; default = position; equal ranks allowed
inference:
  roles:
    http-controller: ["src/**/*.handler.ts"]
  modules:
    max_module_files: 200
    shared_directories: ["platform", "!core"] # extends the defaults; "!" removes a default
  layers:
    directory_layers: { endpoints: controller, usecases: application }
```

| Key                                                      | Default                                        | Validation                                                                                              | Method          |
| -------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------- |
| `modules.<name>`                                         | —                                              | glob list or `{ files, entry? }`; name non-empty, no surrounding spaces, no `#` or `~`, not `__proto__` | input           |
| `layers[]` `name`, `files`, `rank`                       | —                                              | unique names; `rank` integer ≥ 0                                                                        | input           |
| `inference.roles.<role>`                                 | `{}`                                           | an `ArchitecturalRole` or `x-` role; glob list                                                          | layer (`roles`) |
| `inference.components.file_roles`                        | `declaration, generated, script, source, test` | file roles, at least one                                                                                | module          |
| `inference.modules.enabled`                              | `true`                                         | boolean                                                                                                 | module          |
| `inference.modules.when_declared`                        | `infer-rest`                                   | `infer-rest` or `none`                                                                                  | module          |
| `inference.modules.file_roles`                           | `source`                                       | file roles, at least one                                                                                | module          |
| `inference.modules.type_only_weight`                     | 0.5                                            | a multiple of 1/1024 in [0, 1] (0, 0.25, 0.5, 1, ...)                                                   | module, layer   |
| `inference.modules.min_edge_confidence`                  | 0.5                                            | [0, 1]                                                                                                  | module, layer   |
| `inference.modules.max_module_files`                     | 120                                            | integer ≥ 2, ≥ `min_module_files`                                                                       | module          |
| `inference.modules.min_module_files`                     | 3                                              | integer ≥ 1                                                                                             | module          |
| `inference.modules.stem_min_coverage`                    | 0.25                                           | [0, 1]                                                                                                  | module          |
| `inference.modules.utility_min_modules`                  | 3                                              | integer ≥ 2 (the shared and root threshold 2 is fixed)                                                  | module          |
| `inference.modules.move_min_support`                     | 2                                              | integer ≥ 1                                                                                             | module          |
| `inference.modules.move_min_weight`                      | 1.0                                            | > 0                                                                                                     | module          |
| `inference.modules.max_passes`                           | 50                                             | integer ≥ 1                                                                                             | module          |
| `inference.modules.attach_tests` / `attach_declarations` | `true` / `true`                                | boolean                                                                                                 | module          |
| `inference.modules.container_directories`                | containers above                               | names, `!name` removes; normalized names distinct                                                       | module, layer   |
| `inference.modules.shared_directories`                   | shared above                                   | as above                                                                                                | module          |
| `inference.modules.generic_tokens`                       | generic tokens above                           | as above                                                                                                | module          |
| `inference.layers.enabled`                               | `true`                                         | boolean; ignored when `layers` is declared                                                              | layer           |
| `inference.layers.directory_layers`                      | directory → layer above                        | name → kebab-case layer or `null` (removes)                                                             | module, layer   |
| `inference.layers.role_layers`                           | role → layer above                             | role → kebab-case layer or `null` (no layer)                                                            | layer           |
| `inference.layers.naming_suffixes`                       | naming suffixes above                          | name → role or `null` (removes)                                                                         | module, layer   |
| `inference.layers.conventional_tiers`                    | tiers above                                    | lists of kebab-case layers, each at most once; replaces the defaults                                    | layer           |
| `inference.layers.min_label_score`                       | 0.5                                            | [0, 1]                                                                                                  | layer           |
| `inference.layers.min_layer_files`                       | 2                                              | integer ≥ 1                                                                                             | layer           |
| `inference.layers.exact_order_max_layers`                | 12                                             | integer in [2, 16]                                                                                      | layer           |
| `analysis.include_tests_in_metrics`                      | `false`                                        | core setting                                                                                            | module          |

Constants that are part of the method: vote confidences (configuration 1.0, naming qualifier 0.8, word and
class-name suffix 0.6, location 0.7), the orchestrator shares (50% and 25%), the shared and root utility
threshold (2), the signal weights and the Louvain parameters.

## Complexity and scale

`F` files, `n` inference nodes, `m` edges between them, `m_IR` IR edges, `D` directory depth, `U` units,
`L` layers, `k` layers in a strongly connected set.

| Step             | Time                                                         | Memory             | Notes                                                                                                             |
| ---------------- | ------------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| weighted graphs  | O(n + m_IR)                                                  | O(n + m)           | from the model's memoized file projections; at most three specifications (module nodes, source files, attachment) |
| components       | O(F · D)                                                     | O(F + directories) |                                                                                                                   |
| roles and labels | O(F + Σ path depth + classes)                                | O(F)               |                                                                                                                   |
| P1 / P2 / P3     | O(n · D) / O(n + m) / O(n + m)                               | O(n)               | P3 as a worklist fixpoint                                                                                         |
| P4               | O(m_U log m_U) per Louvain pass                              | O(n_U + m_U)       | oversized units only                                                                                              |
| P5               | O(passes · (n + m))                                          | O(n + U)           | typed arrays, integer tie-breaks, exact sums                                                                      |
| P7 / P8 / P9     | O(F_attached · D + m_attached) / O(n + m_imports) / O(n + m) | O(n)               |                                                                                                                   |
| layers           | O(F + m + Σ 2^k k² + L² · (L + E_L))                         | O(F + L²)          | `k ≤ 12` by default                                                                                               |
| aggregation      | O(m_IR) per level, plus one more model build                 | O(document)        |                                                                                                                   |

The engine builds the document index three times: the structure model, the model over the structure plus the
final units on which dependencies are aggregated (reused by milestone 6), and the model over the final
document. Each build is linear in the document size; reusing the structural index is a milestone 13 item.

**Measured** with `packages/inference/src/scale.test.ts` (`KATEDRALA_SCALE=1`): a seeded repository of 80%
flat feature directories of 160 files (each split by P4) and 20% layer-organized groups of 160 files with 24
recurring stems each (formed by P2), 10 edges per file, 10% type-only. The default size, N = 12 000 with
120 000 edges, runs in every test run and asserts the invariants without timings. The figures below were
measured once on a Linux cloud machine (4 vCPU Intel Xeon at 2.1 GHz, Node.js 22.22); they are not
comparable with other machines, and heap growth is measured without forced garbage collection. Milestone 13
sets the budgets.

| Files   | Edges     | Generation and model | `inferArchitecture` | Heap growth | Heap used |
| ------- | --------- | -------------------- | ------------------- | ----------- | --------- |
| 48 000  | 480 000   | 14.3 s               | 9.9 s               | 260 MiB     | 597 MiB   |
| 100 000 | 1 000 000 | 38.4 s               | 31.0 s              | 1 049 MiB   | 1 643 MiB |

At 48 000 files the stages took: components 0.06 s, roles 0.6 s, modules 7.0 s, layers 0.9 s, the units model
1.5 s, and the aggregation 1.8 s (components), 2.0 s (modules) and 0.3 s (layers).

## Results on the fixtures

Generated from the golden sections (`tests/fixtures/golden/`) on the linker graphs of the fixtures. Files
count every member, attached tests and declarations included (shown in parentheses). The linker-graph replay
of the plan predicted every membership, rank and confidence below exactly (high-fan-in's `mod:src#order`,
0.5045, was printed 0.505 by the replay and 0.504 here: the same value, rounded differently for display).

#### ambiguous-boundaries

| Module             | Name        | Kind    | Files | Confidence |
| ------------------ | ----------- | ------- | ----- | ---------- |
| `mod:src`          | coffee-shop | root    | 1     | 0.867      |
| `mod:src/cart`     | cart        | feature | 5     | 0.812      |
| `mod:src/catalog`  | catalog     | feature | 7     | 0.777      |
| `mod:src/checkout` | checkout    | feature | 11    | 0.894      |
| `mod:src/common`   | common      | shared  | 4     | 0.558      |

No layers (only `service` would survive pruning). The relocations are exactly the fixture's `misplaced`
files. Design: cart 0.844 and catalog 0.801; the linker adds the `uses` pair `cart-service → catalog/product`.
The design gave `checkout/stock-availability.ts` a dependency weight of 1.5 on catalog; on the linker graph
it is 2.0, because a runtime `uses` edge (member access through the declared type) lies behind its
`import type { Product }`.

#### circular-dependencies

| Module                  | Name          | Kind            | Files | Confidence |
| ----------------------- | ------------- | --------------- | ----- | ---------- |
| `mod:src`               | board-core    | root            | 1     | 0.867      |
| `mod:src/api`           | api           | layer directory | 3     | 0.837      |
| `mod:src/demo`          | demo          | feature         | 1     | 0.250      |
| `mod:src/notifications` | notifications | feature         | 1     | 0.250      |
| `mod:src/people`        | people        | feature         | 2     | 0.720      |
| `mod:src/shared`        | shared        | shared          | 1     | 0.867      |
| `mod:src/workflow`      | workflow      | feature         | 3     | 0.757      |

No layers. `src/index.ts` is the package's declared entry point and barrel, a composition root by the
entry-point rule; `src/demo/seed.ts` is one by the shape rule; `src/shared/id.ts` is a utility.

#### clean-architecture

| Module                   | Name            | Kind            | Files | Confidence |
| ------------------------ | --------------- | --------------- | ----- | ---------- |
| `mod:src`                | library-lending | root            | 1     | 0.867      |
| `mod:src/application`    | application     | layer directory | 4     | 0.512      |
| `mod:src/domain`         | domain          | layer directory | 10    | 0.727      |
| `mod:src/infrastructure` | infrastructure  | layer directory | 6     | 0.650      |
| `mod:src/presentation`   | presentation    | layer directory | 4     | 0.797      |

| Layer            | Rank | Files | Confidence |
| ---------------- | ---- | ----- | ---------- |
| `infrastructure` | 0    | 6     | 0.737      |
| `presentation`   | 0    | 4     | 0.795      |
| `application`    | 1    | 4     | 0.795      |
| `domain`         | 2    | 10    | 0.878      |

Layers equal the design's exactly. Design module confidences: application 0.551, domain 0.780,
infrastructure 0.600. The linker graph has 19 file pairs connected by `calls`, `instantiates`,
`references-type` or `implements` edges without an import, not all of which the prototype's barrel
resolution produced, and pairs the linker marks runtime where the prototype saw `import type`.

#### dependency-violations

| Module                 | Name          | Kind            | Files | Confidence |
| ---------------------- | ------------- | --------------- | ----- | ---------- |
| `mod:analytics`        | analytics     | declared        | 2     | —          |
| `mod:payments`         | payments      | declared        | 3     | —          |
| `mod:src`              | order-backend | root            | 2     | 0.750      |
| `mod:src#customer`     | customers     | stem            | 4     | 0.746      |
| `mod:src#order`        | orders        | stem            | 4     | 0.685      |
| `mod:src#refund`       | refund        | stem            | 2     | 0.725      |
| `mod:src/repositories` | repositories  | layer directory | 1     | 0.367      |

| Layer        | Rank | Files | Confidence |
| ------------ | ---- | ----- | ---------- |
| `controller` | 0    | 3     | 0.939      |
| `service`    | 1    | 4     | 0.916      |
| `repository` | 2    | 3     | 0.911      |
| `domain`     | 3    | 2     | 0.845      |

Design: customers 0.751 and orders 0.680; on the linker graph six pairs are runtime that the prototype saw
as type-only. The inferred `customers ↔ orders` cycle exists by design (see
[Declared modules and rules](#declared-modules-and-rules)). The declared module file
`payments/checkout.ts` is in `service` through its class name.

#### express-app

| Module                | Name        | Kind            | Files | Confidence |
| --------------------- | ----------- | --------------- | ----- | ---------- |
| `mod:src`             | orders-api  | root            | 6     | 0.750      |
| `mod:src#order`       | orders      | stem            | 6     | 0.771      |
| `mod:src#user`        | users       | stem            | 5     | 0.654      |
| `mod:src/controllers` | controllers | layer directory | 2     | 0.567      |
| `mod:src/db`          | db          | layer directory | 1     | 0.367      |
| `mod:src/middleware`  | middleware  | layer directory | 3     | 0.420      |
| `mod:src/routes`      | routes      | layer directory | 1     | 0.367      |

| Layer        | Rank | Files | Confidence |
| ------------ | ---- | ----- | ---------- |
| `route`      | 0    | 3     | 0.911      |
| `controller` | 1    | 4     | 0.896      |
| `middleware` | 1    | 3     | 0.712      |
| `service`    | 2    | 2     | 0.872      |
| `client`     | 3    | 1     | 0.798      |
| `repository` | 3    | 2     | 0.843      |
| `database`   | 4    | 1     | 0.685      |
| `model`      | 4    | 2     | 0.788      |

Ranks equal the design's. The design expected controller → service by convention (`order-support` 0.43);
on the linker graph the controllers reach the services through `calls` edges resolved through
`container.ts`, so the order is observed (`order-support` 0.857) and the conventional arcs are middleware →
service, middleware → database, service → database, client → database, client → model and repository →
database. `clients/stripe.client.ts` was alone in `src/clients` and is absorbed into `mod:src#order`;
`container.ts`, `config.ts`, `errors.ts` and `logger.ts` are utilities; `src/types/express.d.ts` has no
dependent and stays unassigned.

#### fastify-app

| Module            | Name            | Kind            | Files          | Confidence |
| ----------------- | --------------- | --------------- | -------------- | ---------- |
| `mod:src`         | fulfillment-api | root            | 7 (1 attached) | 0.750      |
| `mod:src#order`   | orders          | stem            | 6              | 0.759      |
| `mod:src/plugins` | plugins         | feature         | 2              | 0.500      |
| `mod:src/routes`  | routes          | layer directory | 1              | 0.367      |

| Layer        | Rank | Files | Confidence |
| ------------ | ---- | ----- | ---------- |
| `route`      | 0    | 1     | 0.278      |
| `handler`    | 1    | 1     | 0.762      |
| `hook`       | 2    | 1     | 0.278      |
| `service`    | 2    | 2     | 0.820      |
| `client`     | 3    | 1     | 0.779      |
| `repository` | 3    | 1     | 0.779      |
| `schema`     | 4    | 1     | 0.695      |

Not in the design's tables. `clients/shipping.client.ts` and `services/pricing.ts` are absorbed into
`mod:src#order` and `hooks/auth.ts` into `mod:src/plugins` (each was alone in its directory);
`test/orders.test.ts` is attached to `mod:src` by majority (1 of 1).

#### high-fan-in

| Module              | Name         | Kind            | Files | Confidence |
| ------------------- | ------------ | --------------- | ----- | ---------- |
| `mod:src`           | shop-service | root            | 1     | 0.867      |
| `mod:src#email`     | email        | stem            | 2     | 0.435      |
| `mod:src#inventory` | inventory    | stem            | 2     | 0.560      |
| `mod:src#order`     | order        | stem            | 4     | 0.504      |
| `mod:src#user`      | user         | stem            | 3     | 0.506      |
| `mod:src/api`       | api          | layer directory | 3     | 0.670      |
| `mod:src/core`      | core         | shared          | 3     | 0.753      |
| `mod:src/jobs`      | jobs         | layer directory | 3     | 0.420      |
| `mod:src/storage`   | storage      | layer directory | 3     | 0.587      |

| Layer     | Rank | Files | Confidence |
| --------- | ---- | ----- | ---------- |
| `api`     | 0    | 2     | 0.805      |
| `route`   | 1    | 2     | 0.840      |
| `job`     | 2    | 5     | 0.786      |
| `service` | 3    | 5     | 0.950      |
| `store`   | 4    | 3     | 0.890      |
| `storage` | 5    | 2     | 0.845      |

Stem coverage 10 of 20, as in the design. `core/logger.ts` and `core/errors.ts` are utilities.
`services/payment.service.ts` was alone in `src/services` and is absorbed into `mod:src#order`. The stem
modules have no model file named after the stem, so they keep the first token (`order`, not `orders`).
`job` ranks below `route` through the conventional arc route → job.

#### high-fan-out

| Module             | Name               | Kind            | Files | Confidence |
| ------------------ | ------------------ | --------------- | ----- | ---------- |
| `mod:src`          | fulfillment-worker | root            | 2     | 0.900      |
| `mod:src/adapters` | adapters           | layer directory | 11    | 0.730      |
| `mod:src/services` | services           | layer directory | 10    | 0.467      |

| Layer     | Rank | Files | Confidence |
| --------- | ---- | ----- | ---------- |
| `service` | 0    | 10    | 0.962      |
| `adapter` | 1    | 11    | 0.880      |

`src/main.ts` (entry-point rule) and `src/orchestrator.ts` (shape rule) are composition roots: the
orchestrator's runtime dependencies split exactly 50/50 between ten adapters and ten services, which the
"none above 50%" condition accepts.

#### javascript-commonjs

| Module             | Name        | Kind            | Files | Confidence |
| ------------------ | ----------- | --------------- | ----- | ---------- |
| `mod:src`          | todo-server | root            | 2     | 0.750      |
| `mod:src/lib`      | lib         | shared          | 3     | 0.420      |
| `mod:src/plugins`  | plugins     | feature         | 2     | 0.275      |
| `mod:src/routes`   | routes      | layer directory | 2     | 0.400      |
| `mod:src/services` | services    | layer directory | 1     | 0.367      |
| `mod:src/store`    | store       | layer directory | 1     | 0.367      |
| `mod:src/views`    | views       | layer directory | 2     | 0.650      |

| Layer     | Rank | Files | Confidence |
| --------- | ---- | ----- | ---------- |
| `route`   | 0    | 2     | 0.778      |
| `view`    | 1    | 2     | 0.712      |
| `service` | 2    | 1     | 0.758      |
| `store`   | 2    | 1     | 0.341      |

Style `mixed` (`plugins` is a feature directory, `lib` a shared one); `todo` stays two components, so no stem
is kept. `mod:src/plugins` has no dependency evidence and keeps the design's 0.275.

#### layered-architecture

| Module            | Name         | Kind   | Files | Confidence |
| ----------------- | ------------ | ------ | ----- | ---------- |
| `mod:src`         | shop-backend | root   | 1     | 0.867      |
| `mod:src#order`   | orders       | stem   | 5     | 0.888      |
| `mod:src#payment` | payments     | stem   | 5     | 0.807      |
| `mod:src#user`    | users        | stem   | 4     | 0.747      |
| `mod:src/shared`  | shared       | shared | 5     | 0.843      |

| Layer        | Rank | Files | Confidence |
| ------------ | ---- | ----- | ---------- |
| `controller` | 0    | 3     | 0.939      |
| `service`    | 1    | 4     | 0.925      |
| `repository` | 2    | 3     | 0.939      |
| `model`      | 3    | 4     | 0.862      |

Memberships and layers equal the design's. Design: users 0.730; on the linker graph seven of its pairs are
runtime that the prototype saw as type-only (for example `user.repository → models/user`: calls and member
uses through declared types behind an `import type` line).

#### monorepo

| Module                            | Name       | Kind            | Files | Confidence |
| --------------------------------- | ---------- | --------------- | ----- | ---------- |
| `mod:packages/api/src`            | api        | root            | 2     | 0.750      |
| `mod:packages/api/src/handlers`   | handlers   | layer directory | 2     | 0.400      |
| `mod:packages/core/src`           | core       | root            | 1     | 0.867      |
| `mod:packages/core/src/orders`    | orders     | feature         | 4     | 0.850      |
| `mod:packages/shared/src`         | shared     | root            | 4     | 0.708      |
| `mod:packages/web/src`            | web        | root            | 2     | 0.600      |
| `mod:packages/web/src/components` | components | layer directory | 2     | 0.733      |

| Layer       | Rank | Files | Confidence |
| ----------- | ---- | ----- | ---------- |
| `component` | 0    | 2     | 0.295      |
| `handler`   | 0    | 2     | 0.295      |

Components equal the design's tree. The design listed `catalog` as a module of `@acme/core`; on the linker
graph a `uses` edge gives `catalog/product.ts` two of its three dependents in `orders`, and the lone-file
cascade then moves `catalog/catalog.ts` (see [P5](#p5-strict-majority-reassignment)). No module spans
packages.

#### nestjs-app

| Module             | Name             | Kind    | Files          | Confidence |
| ------------------ | ---------------- | ------- | -------------- | ---------- |
| `mod:src`          | payments-service | root    | 3              | 0.820      |
| `mod:src/common`   | common           | shared  | 3              | 0.587      |
| `mod:src/config`   | config           | shared  | 2              | 0.650      |
| `mod:src/orders`   | orders           | feature | 7 (1 attached) | 0.816      |
| `mod:src/payments` | payments         | feature | 6              | 0.749      |

| Layer        | Rank | Files | Confidence |
| ------------ | ---- | ----- | ---------- |
| `controller` | 0    | 3     | 0.890      |
| `middleware` | 1    | 2     | 0.929      |
| `service`    | 2    | 3     | 0.890      |
| `dto`        | 3    | 3     | 0.889      |
| `model`      | 3    | 2     | 0.879      |

Ranks equal the design's. `orders.service.spec.ts` depends on two orders and two payments files, so it is
attached to `orders` by location, and its `attached-files` evidence says so. `stripe.client.ts` has a
single naming vote and gets no layer.

#### simple-dependencies

| Module             | Name           | Kind            | Files | Confidence |
| ------------------ | -------------- | --------------- | ----- | ---------- |
| `mod:src`          | expense-report | root            | 2     | 0.900      |
| `mod:src/services` | services       | layer directory | 1     | 0.367      |
| `mod:src/utils`    | utils          | shared          | 3     | 0.420      |

No layers. `src` has one layer directory and no feature directory (style `none`).

#### tangled-architecture

| Module              | Name        | Kind    | Files | Confidence |
| ------------------- | ----------- | ------- | ----- | ---------- |
| `mod:src`           | corner-shop | root    | 1     | 0.867      |
| `mod:src/cart`      | cart        | feature | 5     | 0.532      |
| `mod:src/catalog`   | catalog     | feature | 5     | 0.607      |
| `mod:src/checkout`  | checkout    | feature | 5     | 0.570      |
| `mod:src/customers` | customers   | feature | 5     | 0.514      |
| `mod:src/inventory` | inventory   | feature | 5     | 0.638      |
| `mod:src/lib`       | lib         | shared  | 3     | 0.920      |

No layers. Design: cart 0.551, catalog 0.644, checkout 0.548, customers 0.576, inventory 0.695. On the linker
graph `calls` and `uses` edges give four more files dependents in three other features, so seven files are
utilities (the design found three) and leave the evidence, and thirteen file pairs are connected without an
import. The tangle stays visible in the confidences instead of being re-clustered away.

#### typescript-features

| Module              | Name      | Kind            | Files | Confidence |
| ------------------- | --------- | --------------- | ----- | ---------- |
| `mod:src`           | shop-core | root            | 9     | 0.730      |
| `mod:src/billing`   | billing   | feature         | 3     | 0.800      |
| `mod:src/customers` | customers | feature         | 2     | 0.408      |
| `mod:src/orders`    | orders    | feature         | 4     | 0.512      |
| `mod:src/shared`    | shared    | shared          | 1     | 0.367      |
| `mod:src/ui`        | ui        | layer directory | 2     | 0.650      |
| `mod:src/utils`     | utils     | shared          | 2     | 0.650      |

No layers (only `presentation` would survive pruning). `src/index.ts` (the package barrel) and `src/cli.ts`
are composition roots by the entry-point rule; the four barrels are facades; `src/globals.d.ts` stays
unassigned (see [P7](#p7-tests-and-declarations)).

## References

- Andritsos, P. & Tzerpos, V. 2005. "Information-Theoretic Software Clustering". IEEE Transactions on
  Software Engineering 31(2).
- Anquetil, N. & Lethbridge, T. C. 1999. "Recovering software architecture from the names of source files".
  Journal of Software Maintenance: Research and Practice 11(3):201–221.
- Blondel, V. D., Guillaume, J.-L., Lambiotte, R. & Lefebvre, E. 2008. "Fast unfolding of communities in large
  networks". Journal of Statistical Mechanics: Theory and Experiment P10008.
- Bodlaender, H. L., Fomin, F. V., Koster, A. M. C. A., Kratsch, D. & Thilikos, D. M. 2012. "A note on exact
  algorithms for vertex ordering problems on graphs". Theory of Computing Systems 50(3):420–432.
- Corazza, A., Di Martino, S., Maggio, V. & Scanniello, G. 2016. "Weighing lexical information for software
  clustering in the context of architecture recovery". Empirical Software Engineering 21(1):72–103.
- Eades, P., Lin, X. & Smyth, W. F. 1993. "A fast and effective heuristic for the feedback arc set problem".
  Information Processing Letters 47(6):319–323.
- Fortunato, S. & Barthélemy, M. 2007. "Resolution limit in community detection". Proceedings of the National
  Academy of Sciences 104(1):36–41.
- Garcia, J., Ivkovic, I. & Medvidovic, N. 2013. "A comparative analysis of software architecture recovery
  techniques". 28th IEEE/ACM International Conference on Automated Software Engineering (ASE).
- Harman, D. 1991. "How effective is suffixing?". Journal of the American Society for Information Science
  42(1):7–15.
- Hubert, L. & Arabie, P. 1985. "Comparing partitions". Journal of Classification 2:193–218.
- Kannan, R., Vempala, S. & Vetta, A. 2004. "On clusterings: Good, bad and spectral". Journal of the ACM
  51(3):497–515.
- Karp, R. M. 1972. "Reducibility among combinatorial problems". In Miller, R. E. & Thatcher, J. W. (eds.),
  Complexity of Computer Computations, Plenum Press, 85–103.
- Kuhn, A., Ducasse, S. & Gîrba, T. 2007. "Semantic clustering: Identifying topics in source code".
  Information and Software Technology 49(3):230–243.
- Lakos, J. 1996. "Large-Scale C++ Software Design". Addison-Wesley.
- Laval, J., Anquetil, N., Bhatti, U. & Ducasse, S. 2013. "oZone: Layer identification in the presence of
  cyclic dependencies". Science of Computer Programming 78(8):1055–1072.
- Lutellier, T., Chollak, D., Garcia, J., Tan, L., Rayside, D., Medvidovic, N. & Kroeger, R. 2015. "Comparing
  Software Architecture Recovery Techniques Using Accurate Dependencies". 37th International Conference on
  Software Engineering (ICSE), vol. 2, 69–78.
- Lutellier, T., Chollak, D., Garcia, J., Tan, L., Rayside, D., Medvidovic, N. & Kroeger, R. 2018. "Measuring
  the Impact of Code Dependencies on Software Architecture Recovery Techniques". IEEE Transactions on
  Software Engineering 44(2):159–181.
- Mancoridis, S., Mitchell, B. S., Rorres, C., Chen, Y. & Gansner, E. R. 1998. "Using Automatic Clustering to
  Produce High-Level System Organizations of Source Code". 6th International Workshop on Program
  Comprehension (IWPC), 45–52.
- Mancoridis, S., Mitchell, B. S., Chen, Y. & Gansner, E. R. 1999. "Bunch: A Clustering Tool for the Recovery
  and Maintenance of Software System Structures". IEEE International Conference on Software Maintenance
  (ICSM), 50–59.
- Martin, R. C. 2017. "Clean Architecture: A Craftsman's Guide to Software Structure and Design". Prentice
  Hall.
- Mitchell, B. S. & Mancoridis, S. 2006. "On the Automatic Modularization of Software Systems Using the Bunch
  Tool". IEEE Transactions on Software Engineering 32(3).
- Newman, M. E. J. & Girvan, M. 2004. "Finding and evaluating community structure in networks". Physical
  Review E 69(2):026113.
- Pearl, J. 1988. "Probabilistic Reasoning in Intelligent Systems: Networks of Plausible Inference". Morgan
  Kaufmann.
- Raghavan, U. N., Albert, R. & Kumara, S. 2007. "Near linear time algorithm to detect community structures in
  large-scale networks". Physical Review E 76(3):036106.
- Reichardt, J. & Bornholdt, S. 2006. "Statistical mechanics of community detection". Physical Review E
  74(1):016110.
- Sarkar, S., Maskeri, G. & Ramachandran, S. 2009. "Discovery of architectural layers and measurement of
  layering violations in source code". Journal of Systems and Software 82(11):1891–1905.
- Traag, V. A., Waltman, L. & van Eck, N. J. 2019. "From Louvain to Leiden: guaranteeing well-connected
  communities". Scientific Reports 9:5233.
- Tzerpos, V. & Holt, R. C. 2000a. "ACDC: An Algorithm for Comprehension-Driven Clustering". 7th Working
  Conference on Reverse Engineering (WCRE), 258ff.
- Tzerpos, V. & Holt, R. C. 2000b. "On the stability of software clustering algorithms". 8th International
  Workshop on Program Comprehension (IWPC), 211–218.
- Wu, J., Hassan, A. E. & Holt, R. C. 2005. "Comparison of clustering algorithms in the context of software
  evolution". IEEE International Conference on Software Maintenance (ICSM), 525–535.

Metrics are documented here from milestone 6.

## Decision numbers

The source code of `@katedrala/inference` and of the engine's inference stage cites the decisions of the
milestone 5 plan as `D-nn` where it implements them. Each is described in the section given here.

| Decision         | Subject                                                                         | Section                                                                  |
| ---------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D-01             | only admitted edges decide runtime against type-only                            | [Weighted file graph](#the-weighted-file-graph-katedrala-heuristic)      |
| D-02             | the metrics projection's edge kinds, type-only always included                  | [Weighted file graph](#the-weighted-file-graph-katedrala-heuristic)      |
| D-03             | one graph restricted per scope: no cross-package evidence                       | [P0](#p0-scopes-and-nodes)                                               |
| D-04             | barrel degrees count admitted edges, weight 0 included                          | [Weighted file graph](#the-weighted-file-graph-katedrala-heuristic)      |
| D-05             | ASCII-only tokenization and case folding                                        | [Conventions](#conventions)                                              |
| D-06             | only the first token of the head forms a file stem                              | [Tokens](#tokens-the-s-stemmer-and-file-stems-katedrala-heuristic)       |
| D-07             | containers match the exact name                                                 | [Directory kinds](#directory-kinds-and-source-roots-katedrala-heuristic) |
| D-08             | kind precedence container > layer > shared > feature                            | [Directory kinds](#directory-kinds-and-source-roots-katedrala-heuristic) |
| D-09             | naming-suffix keys never form stems                                             | [Default vocabularies](#default-vocabularies)                            |
| D-10             | additions to the design's vocabularies                                          | [Default vocabularies](#default-vocabularies)                            |
| D-11             | source roots: over nodes for modules, over source files for roles               | [Directory kinds](#directory-kinds-and-source-roots-katedrala-heuristic) |
| D-12, D-13       | names and packages of unnamed and shared manifests                              | [Components](#components)                                                |
| D-14             | votes combine by maximum within a source, noisy-OR across sources               | [Architectural roles](#architectural-roles)                              |
| D-15, D-16       | word suffixes need two tokens; class-name votes from exported top-level classes | [Architectural roles](#architectural-roles)                              |
| D-17             | roles for `source` files only                                                   | [Architectural roles](#architectural-roles)                              |
| D-18             | location votes from the outermost layer-kind directory                          | [Architectural roles](#architectural-roles)                              |
| D-19             | ⊥ wins exact ties                                                               | [Architectural roles](#architectural-roles)                              |
| D-20             | inferred roles and units are replaced, never read                               | [Architectural roles](#architectural-roles)                              |
| D-21             | `when_declared` and `enabled`                                                   | [P0](#p0-scopes-and-nodes)                                               |
| D-22, D-23, D-24 | declared membership, overlaps by name, `configuration-warning`                  | [Declared modules and rules](#declared-modules-and-rules)                |
| D-25             | loose files of a split non-container keep its kind                              | [P1](#p1-prior-units)                                                    |
| D-26             | style `none`; containers counted in no class                                    | [P2](#p2-organization-style-and-stem-units)                              |
| D-27, D-28       | union of connected stem components; sub-directory stems                         | [P2](#p2-organization-style-and-stem-units)                              |
| D-29, D-30, D-31 | dependents of weight > 0; worklist fixpoint; declared entry points              | [P3](#p3-structural-classes)                                             |
| D-32, D-33, D-34 | units split by P4, merge rounds, keys                                           | [P4](#p4-oversized-directories)                                          |
| D-35, D-36, D-37 | destinations, relocation records, non-convergence                               | [P5](#p5-strict-majority-reassignment)                                   |
| D-38, D-39       | root names; stem names from pre-pruning labels                                  | [P6](#p6-identity)                                                       |
| D-41, D-42       | attachment graph; location by direct nodes                                      | [P7](#p7-tests-and-declarations)                                         |
| D-43             | entry points of declared modules without `entry`                                | [P8](#p8-entry-points-public-api-packages)                               |
| D-45, D-46, D-47 | absent signals listed; shared usage keeps utilities; contested members          | [P9](#p9-confidence-and-evidence)                                        |
| D-48, D-49       | kind signals; three pinned-class signals                                        | [Module kinds](#module-kinds-and-their-signals)                          |
| D-50             | declared layers: source files, list order                                       | [Declared layers and monorepos](#declared-layers-and-monorepos)          |
| D-51             | the layer graph uses the module weighting                                       | [The layer graph](#the-layer-graph)                                      |
| D-52             | the exact order dynamic programme and its tie-break                             | [Order](#order-exact-greedy-conventional)                                |
| D-53             | conventional arcs: order of processing, shared packages                         | [Order](#order-exact-greedy-conventional)                                |
| D-54             | absent layer signals count 0                                                    | [Confidence and evidence](#confidence-and-evidence)                      |
| D-55             | unrelated monorepo layers at rank 0                                             | [Declared layers and monorepos](#declared-layers-and-monorepos)          |
| D-56             | method strings                                                                  | [Method strings](#method-strings)                                        |
| D-57, D-58       | rounding; numbers in descriptions                                               | [Conventions](#conventions)                                              |
| D-59, D-61       | validators in the engine; no defaults injected                                  | [Configuration reference](#configuration-reference), ADR-013             |
| D-60             | three model builds                                                              | [Complexity and scale](#complexity-and-scale)                            |
| D-62             | `moduleCycles` of dependency-violations concerns declared modules               | [Declared modules and rules](#declared-modules-and-rules)                |
| D-63             | `publicApi` from imports and re-exports                                         | [P8](#p8-entry-points-public-api-packages)                               |
| D-64, D-65       | `attached-files`; the attachment policy                                         | [P7](#p7-tests-and-declarations)                                         |
| D-66             | wording of heuristic conclusions                                                | [Conventions](#conventions)                                              |
| D-67             | exact dyadic arithmetic                                                         | [Conventions](#conventions)                                              |
| D-68             | pinned Louvain parameters                                                       | [P4](#p4-oversized-directories)                                          |
| D-69             | normalization of configured names                                               | [Configured names](#configured-names)                                    |
| D-70             | stem files join the feature child with the smallest path                        | [P2](#p2-organization-style-and-stem-units)                              |
| D-71             | glob lists need a positive pattern; empty matches warned                        | [Configuration reference](#configuration-reference)                      |
| D-72             | bounded `relocated-files`                                                       | [Evidence order](#evidence-order-rounding-entities)                      |
| D-73             | rule semantics belong to milestone 8 (`docs/RULES.md`)                          | [Declared modules and rules](#declared-modules-and-rules)                |
| D-74             | condition 4 uses the current unit size                                          | [P5](#p5-strict-majority-reassignment)                                   |

D-40 and D-44 were superseded by D-65 and D-63 during planning.
