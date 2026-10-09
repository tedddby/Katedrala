/**
 * Lexical definitions shared by roles, modules and layers (§1.4; docs/ALGORITHMS.md, "Shared definitions"):
 * ASCII case folding, name tokens, the S-stemmer, file-name parts, file stems and plurals.
 *
 * Determinism (D-05): tokenization and case folding are ASCII-only. `\p{…}` classes and
 * `String.prototype.toLowerCase` depend on the Unicode tables of the runtime, so stems and module ids could
 * differ between Node.js versions. Non-ASCII characters are therefore kept as letters, without case folding
 * and without camel-case splitting: `Été` and `été` give different stems, which docs/ALGORITHMS.md states.
 * Tokens never contain an ASCII separator such as `#`, `~`, `%` or `/`, so stems are always safe inside
 * module keys (`inferredModuleKey`).
 */
import type { NameParts, StemToken, Token, Vocabulary } from "./types.js";

const ASCII_UPPER = /[A-Z]/g;

/** Maps one ASCII upper-case letter to its lower-case letter. */
function lowerAsciiLetter(letter: string): string {
  return String.fromCharCode(letter.charCodeAt(0) + 32);
}

/**
 * ASCII lower-casing [DERIVED]: `A`–`Z` become `a`–`z`; every other character, non-ASCII letters included, is
 * unchanged (D-05). The only case folding inference uses.
 *
 * Complexity: O(length). Determinism: independent of locale and of the runtime's Unicode tables.
 *
 * @example asciiLower("ÉtéService") === "Étéservice"
 */
export function asciiLower(text: string): string {
  return text.replace(ASCII_UPPER, lowerAsciiLetter);
}

/**
 * Runs of separators: characters that are neither ASCII letters, ASCII digits nor non-ASCII characters.
 * Without the `u` flag the class matches UTF-16 code units, so both halves of a surrogate pair (U+D800–U+DFFF)
 * are kept as letters, like every other non-ASCII character (D-05).
 */
const SEPARATORS = /[^A-Za-z0-9\u0080-\uFFFF]+/;

/** ASCII camel-case boundaries: `orderLine` → `order|Line`, `HTTPServer` → `HTTP|Server`, `v2Api` → `v2|Api`. */
const CAMEL_BOUNDARY = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/;

/**
 * Split a name into tokens [KATEDRALA HEURISTIC] (§1.4, D-05): split on runs of ASCII characters other than
 * letters and digits, then at ASCII camel-case boundaries. Each token keeps its original spelling (`text`)
 * and its ASCII-lower-cased `key`.
 *
 * Complexity: O(length). Determinism: ASCII-only rules, independent of locale and Unicode tables.
 *
 * @example tokenize("HTTPServer").map((t) => t.key) // ["http", "server"]
 * @example tokenize("Été-Facture") // [{ text: "Été", key: "Été" }, { text: "Facture", key: "facture" }]
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const part of text.split(SEPARATORS)) {
    if (part === "") continue;
    // Camel-case boundaries are zero-width and never at either end, so every piece is non-empty.
    for (const piece of part.split(CAMEL_BOUNDARY))
      tokens.push({ text: piece, key: asciiLower(piece) });
  }
  return tokens;
}

/**
 * The S-stemmer [ESTABLISHED] (Harman, D. 1991. "How effective is suffixing?". Journal of the American
 * Society for Information Science 42(1):7–15) with Katedrala's sibilant rule and length guards
 * [KATEDRALA HEURISTIC] (§1.4). Applied to the ASCII-lower-cased word; the first rule that applies wins:
 *
 * 1. ends in `ies`, not `eies` or `aies`, length > 4: `-ies` → `-y` (`categories` → `category`);
 * 2. ends in `sses`, `xes`, `shes` or `zzes`: drop `es` (`addresses` → `address`, `boxes` → `box`);
 * 3. ends in `es`, not `aes`, `ees` or `oes`: drop `s` (`services` → `service`, `pies` → `pie`);
 * 4. ends in `s`, not `ss` or `us`, length > 3: drop `s` (`payments` → `payment`; `bus`, `ids` kept);
 * 5. otherwise unchanged (`status`, `class`).
 *
 * Stems are used for grouping only; names keep the original spelling. The function is idempotent.
 *
 * Complexity: O(length). Determinism: ASCII-only (D-05).
 */
export function sStem(word: string): string {
  const w = asciiLower(word);
  if (w.endsWith("ies") && !w.endsWith("eies") && !w.endsWith("aies") && w.length > 4) {
    return `${w.slice(0, -3)}y`;
  }
  if (w.endsWith("sses") || w.endsWith("xes") || w.endsWith("shes") || w.endsWith("zzes")) {
    return w.slice(0, -2);
  }
  if (w.endsWith("es") && !w.endsWith("aes") && !w.endsWith("ees") && !w.endsWith("oes")) {
    return w.slice(0, -1);
  }
  if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && w.length > 3) {
    return w.slice(0, -1);
  }
  return w;
}

/**
 * The head and qualifiers of a file name [DERIVED] (§1.4): strip the last extension, split the rest on `.`;
 * the head is the first part (original spelling), the qualifiers are the others, ASCII-lower-cased.
 * `payment.controller.ts` → head `payment`, qualifiers `[controller]`. Only the last path segment is read,
 * so a path may be passed. Like `extensionOf` in `@katedrala/ir`, a leading dot does not start an
 * extension: `.eslintrc` has the head `""` and the qualifier `eslintrc`.
 *
 * Complexity: O(length). Determinism: ASCII-only case folding (D-05).
 */
export function nameParts(fileName: string): NameParts {
  const name = fileName.slice(fileName.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const [head = "", ...qualifiers] = base.split(".");
  return { head, qualifiers: qualifiers.map(asciiLower) };
}

/**
 * The file stem of a path [KATEDRALA HEURISTIC] (§1.4, D-06): the S-stem of the first token of the file
 * name's head, with that token's original spelling, which modules are named by (§3.10). Undefined when the
 * head has no token, when the stem is shorter than two characters, or when it is a generic token or a
 * naming-suffix key (`vocabulary.nonStemTokens`, D-09). `payment-gateway.ts` → `payment`;
 * `OrderService.ts` → `order` (original `Order`); `index.ts`, `dto.ts` → undefined.
 *
 * Complexity: O(length of the file name). Determinism: ASCII-only (D-05).
 */
export function fileStem(path: string, vocabulary: Vocabulary): StemToken | undefined {
  // D-06: only the first token of the head is considered.
  const first = tokenize(nameParts(path).head)[0];
  if (first === undefined) return undefined;
  const stem = sStem(first.key);
  // D-09: generic tokens and role tokens (naming-suffix keys) never form a stem.
  if (stem.length < 2 || vocabulary.nonStemTokens.has(stem)) return undefined;
  return { stem, original: first.text };
}

/** ASCII letters other than vowels (`y` counts as a consonant); no `i` flag, so no Unicode case tables. */
const ASCII_CONSONANT = /^[b-df-hj-np-tv-zB-DF-HJ-NP-TV-Z]$/;

/** Whether a character is an ASCII consonant. */
function isAsciiConsonant(character: string | undefined): boolean {
  return character !== undefined && ASCII_CONSONANT.test(character);
}

/**
 * The English plural of a singular word [KATEDRALA HEURISTIC] (§3.10, the entity rule of module names):
 *
 * - a consonant followed by `y` → `ies` (`category` → `categories`; `day` → `days`);
 * - `s`, `x`, `z`, `ch`, `sh` → `+es` (`address` → `addresses`, `box` → `boxes`);
 * - otherwise `+s` (`payment` → `payments`).
 *
 * The case of the input is preserved (`Payment` → `Payments`): appended letters are lower case, as in
 * acronym plurals (`SKU` → `SKUs`), and the replaced `y` keeps its case (`CATEGORY` → `CATEGORIES`). Rules
 * match ASCII letters only (D-05). The empty string is returned unchanged.
 *
 * Complexity: O(length). Determinism: ASCII-only (D-05).
 */
export function pluralize(word: string): string {
  if (word === "") return word;
  const lower = asciiLower(word);
  const last = word.at(-1);
  if ((last === "y" || last === "Y") && isAsciiConsonant(word.at(-2))) {
    return `${word.slice(0, -1)}${last === "Y" ? "IES" : "ies"}`;
  }
  if (/(?:[sxz]|ch|sh)$/.test(lower)) return `${word}es`;
  return `${word}s`;
}
