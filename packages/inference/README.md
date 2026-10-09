# @katedrala/inference

Architectural inference over the Katedrala IR: the components of a repository, its architectural roles, its
modules and its layers, each inferred conclusion with a confidence, the evidence behind it, a one-sentence
reason and a method identifier. The algorithms, their rationale and their references are in
[docs/ALGORITHMS.md](../../docs/ALGORITHMS.md); the output is the `components`, `modules` and `layers`
sections and `FileEntity.roles` of the architecture document ([docs/IR.md](../../docs/IR.md)).

| Output     | Truth label           | How                                                                                         |
| ---------- | --------------------- | ------------------------------------------------------------------------------------------- |
| Components | [DERIVED]             | Package roots, directories that contain code, branch points; no thresholds                  |
| Roles      | [KATEDRALA HEURISTIC] | File-name qualifiers and suffixes, exported class names, layer-named directories, globs     |
| Modules    | [KATEDRALA HEURISTIC] | Prior-anchored refinement: directories and file-name stems, overridden by strict majorities |
| Layers     | [KATEDRALA HEURISTIC] | Per-file layer labels, ranked by the observed dependencies between them                     |

Declared modules and layers (the `modules` and `layers` configuration sections) are exact and carry no
inference.

## Design

- **A pure library.** It depends on `@katedrala/ir`, `@katedrala/graph` and `@katedrala/model` only, uses no
  Node.js API and runs in any JavaScript environment; lint enforces both. It does not read configuration
  files or globs: the engine validates the `modules`, `layers` and `inference` sections and passes resolved
  settings and file lists (docs/ARCHITECTURE.md, ADR-013).
- **Deterministic.** No randomness, clock or locale; ASCII-only lexing; edge weights are multiples of 1/1024,
  so every sum, tie and threshold is decided exactly; results do not depend on the order of the document's
  arrays or of the configuration's keys.
- **Explained.** Every inferred module and layer carries `confidence = Σ weight × value` over its weighted
  evidence (absent signals listed and counted 0), context evidence such as relocated, attached and pinned
  files, a reason that begins with "Inferred:", and a method string that lists its non-default parameters
  (`katedrala/module-inference@1?max_module_files=200`).

## API

```ts
import { inferArchitecture, resolveInferenceSettings, withRoles } from "@katedrala/inference";
import { ArchitectureModel, DEFAULT_EDGE_KINDS, DEFAULT_FILE_ROLES } from "@katedrala/model";

const model = ArchitectureModel.from(structure); // the structural sections of a document
const result = inferArchitecture({
  model,
  settings: resolveInferenceSettings(config.inference), // defaults applied, method strings computed
  declarations: { modules: [], roles: [] }, // declared modules, layers and roles, globs resolved
  projection: {
    edgeKinds: new Set(DEFAULT_EDGE_KINDS),
    includeTypeOnly: true,
    fileRoles: new Set(DEFAULT_FILE_ROLES),
  },
  repositoryName: structure.repository.name,
});
const files = withRoles(structure.files, result.roles); // inferred roles merged copy-on-write
```

`@katedrala/engine`'s `analyzeArchitecture()` does all of this, configuration validation and glob resolution
included; use it unless you build your own pipeline.

| Export                                                                | Purpose                                                                    |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `inferArchitecture(input)`                                            | Components, roles, modules and layers with their dependencies and evidence |
| `withRoles(files, roles)`                                             | Merge the inferred roles into the files (replacing earlier inferred ones)  |
| `resolveInferenceSettings(config?, core?)`                            | Effective settings: defaults, normalized vocabularies, method strings      |
| `DEFAULT_INFERENCE_CONFIGURATION`                                     | Every key of the `inference` section at its default, as plain JSON         |
| `INFERENCE_KEYS`, `normalizeVocabularyName`                           | Key lists and name normalization for configuration validators              |
| `sStem(word)`                                                         | The S-stemmer the vocabularies use                                         |
| types (`InferenceInput`, `InferenceResult`, `InferenceSettings`, ...) | Configuration, declarations, settings, input and result                    |

Everything else is internal.
