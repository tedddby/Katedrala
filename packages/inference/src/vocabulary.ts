/**
 * The default vocabularies of architectural inference [KATEDRALA HEURISTIC]: which directory names are
 * containers, shared code or layers, which file-name suffixes name architectural roles, which roles belong to
 * which layer, which name tokens are too generic to name a feature, and the conventional order of layers.
 *
 * They encode common conventions of the TypeScript/JavaScript ecosystem (directory layouts as in Tzerpos, V.
 * & Holt, R. C. 2000. "ACDC: An Algorithm for Comprehension-Driven Clustering". 7th Working Conference on
 * Reverse Engineering; file names as architectural evidence as in Anquetil, N. & Lethbridge, T. C. 1999.
 * "Recovering software architecture from the names of source files". Journal of Software Maintenance:
 * Research and Practice 11(3):201–221). They are the main limitation of the approach for other naming
 * cultures, so every list is configurable (`inference.modules.*_directories`, `generic_tokens`,
 * `inference.layers.*`) and every conclusion's evidence names the entry it used.
 *
 * The lists are the union of the design's tables and the prototype's lists (D-10), written in normalized form
 * (D-69): ASCII lower case, S-stemmed except containers (D-07). Everything here is frozen; arrays are sorted
 * by `compareStrings` and records have sorted keys, so the defaults serialize canonically
 * (`DEFAULT_INFERENCE_CONFIGURATION`). `resolveInferenceSettings` turns them into the effective `Vocabulary`.
 */
import { compareStrings, type ArchitecturalRole } from "@katedrala/ir";

/** A frozen, sorted copy of space-separated names. */
function names(list: string): readonly string[] {
  return Object.freeze(list.split(" ").sort(compareStrings));
}

/** A frozen record with sorted keys from groups of space-separated keys sharing one value. */
function grouped<V>(
  groups: readonly (readonly [keys: string, value: V])[],
): Readonly<Record<string, V>> {
  const entries: [string, V][] = [];
  for (const [keys, value] of groups) for (const key of keys.split(" ")) entries.push([key, value]);
  entries.sort(([a], [b]) => compareStrings(a, b));
  return Object.freeze(Object.fromEntries(entries));
}

/**
 * Container directories [KATEDRALA HEURISTIC]: organizational wrappers whose children are the units
 * (`src`, `packages`, `features`, ...). Matched on the exact ASCII-lower-cased name, never stemmed
 * (D-07): with stemming, `domains` (a container) would capture `domain` (a layer) and `libs` would
 * capture `lib` (shared).
 */
export const DEFAULT_CONTAINER_DIRECTORIES: readonly string[] = names(
  "app apps cmd domains feature features internal libs module modules packages pkg source sources src",
);

/**
 * Shared directories [KATEDRALA HEURISTIC] (S-stemmed keys): code meant for every feature (`shared`,
 * `common`, `utils`, ...). `utility` is listed because `utilities` stems to `utility`, not `util`
 * (D-10).
 */
export const DEFAULT_SHARED_DIRECTORIES: readonly string[] = names(
  "base common config configuration constant core helper interface kernel lib misc setting shared support " +
    "tool type util utility",
);

/**
 * Directory name (S-stemmed key) → layer [KATEDRALA HEURISTIC] (§4.3). Its keys are the "layer" directory
 * kind. `use_case`, `consumer` and `cli` come from the prototype (D-10). Layer names are kebab-case and
 * used as written (D-69).
 */
export const DEFAULT_DIRECTORY_LAYERS: Readonly<Record<string, string>> = grouped([
  ["controller", "controller"],
  ["route router routing", "route"],
  ["handler", "handler"],
  ["resolver", "resolver"],
  ["middleware guard interceptor", "middleware"],
  ["view", "view"],
  ["page screen", "page"],
  ["component", "component"],
  ["presentation ui web http", "presentation"],
  ["api rest graphql endpoint", "api"],
  ["service", "service"],
  ["usecase use-case use_case interactor application", "application"],
  ["domain", "domain"],
  ["model entity", "model"],
  ["schema", "schema"],
  ["dto", "dto"],
  ["repository repo dao persistence", "repository"],
  ["db database", "database"],
  ["data", "data"],
  ["storage", "storage"],
  ["store", "store"],
  ["client", "client"],
  ["gateway", "gateway"],
  ["integration", "integration"],
  ["adapter", "adapter"],
  ["port", "port"],
  ["infrastructure infra", "infrastructure"],
  ["job worker task cron", "job"],
  ["hook", "hook"],
  ["listener subscriber consumer", "listener"],
  ["command cli", "command"],
]);

/**
 * Naming suffix (S-stemmed key) → architectural role [KATEDRALA HEURISTIC] (§4.2): a dotted qualifier
 * (`payment.controller.ts`), the last word of a multi-word file head (`payment-controller.ts`, D-15) or of
 * an exported class name (`PaymentController`, D-16). The keys never form a file stem (D-09).
 */
export const DEFAULT_NAMING_SUFFIXES: Readonly<Record<string, ArchitecturalRole>> =
  grouped<ArchitecturalRole>([
    ["controller", "http-controller"],
    ["route router", "route-definition"],
    ["middleware guard interceptor", "middleware"],
    ["service", "service"],
    ["repository repo", "repository"],
    ["entity model", "data-model"],
    ["dto", "data-transfer-object"],
    ["client", "external-client"],
    ["module", "module-definition"],
    ["store", "state-store"],
    ["page", "ui-page"],
    ["component", "ui-component"],
  ]);

/**
 * Architectural role → layer [KATEDRALA HEURISTIC] (§4.3). `null` marks the cross-cutting roles, which
 * vote for "no layer" (the label ⊥); roles absent from the map, plugin (`x-`) roles included, vote ⊥ as
 * well.
 */
export const DEFAULT_ROLE_LAYERS: Readonly<Record<string, string | null>> = grouped<string | null>([
  ["http-controller", "controller"],
  ["route-definition", "route"],
  ["middleware", "middleware"],
  ["service", "service"],
  ["repository", "repository"],
  ["data-model", "model"],
  ["data-transfer-object", "dto"],
  ["external-client", "client"],
  ["ui-page", "page"],
  ["ui-component", "component"],
  ["state-store", "store"],
  ["module-definition configuration-provider utility", null],
]);

/**
 * Generic tokens [KATEDRALA HEURISTIC] (S-stemmed): technical words that never name a feature, so they never
 * form a file stem (§1.4) or a P2 sub-directory stem (D-28). The prototype's technical tokens (`mapper`,
 * `factory`, `saga`, ...) are part of this configurable default rather than of the role tokens (D-09).
 */
export const DEFAULT_GENERIC_TOKENS: readonly string[] = names(
  "abstract action adapter app base bootstrap client command common component config constant consumer " +
    "container context controller core default dto effect entity enum error event exception factory filter " +
    "fixture guard handler helper hook index init interceptor interface job listener log logger main mapper " +
    "message middleware mock mod model module option page pipe provider query reducer repo repository " +
    "request resolver response result route router saga schema selector server service setting setup " +
    "shared slice spec store story style subscriber test type util validator view worker",
);

/**
 * Conventional tiers of layers [KATEDRALA HEURISTIC], outermost first (§4.4): used only to order layers
 * that no observed dependency path connects (D-53) and to break ties of the exact ordering (D-52).
 * `infrastructure`, `adapter`, `port` and `integration` have no tier: their direction depends on the
 * architecture style (Martin, R. C. 2017. "Clean Architecture". Prentice Hall).
 */
export const DEFAULT_CONVENTIONAL_TIERS: readonly (readonly string[])[] = Object.freeze([
  names("route page"),
  names("controller handler resolver view api presentation middleware job listener command"),
  names("component service application hook store"),
  names("domain repository gateway client"),
  names("database storage data model dto schema"),
]);
