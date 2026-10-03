/**
 * A strict JSON parser that accepts exactly what `JSON.parse` accepts (RFC 8259) and also records the line of
 * every value and member key, so that configuration errors in JSON files can name lines just as in YAML
 * files. (`JSON.parse` error messages do not reliably include positions.)
 */

/** Line information of one parsed JSON value. */
export interface JsonNode {
  /** 1-based line where the value starts. */
  line: number;
  /** For object members: the 1-based line of the member's key. */
  keyLine?: number;
  /** Members of an object by key (the last occurrence of a duplicated key, as `JSON.parse` keeps). */
  members?: Map<string, JsonNode>;
  /** Elements of an array, in order. */
  elements?: JsonNode[];
}

/** Outcome of {@link parseJsonWithPositions}. */
export type JsonParseResult =
  | {
      ok: true;
      /** The parsed value, identical to `JSON.parse(text)`. */
      value: unknown;
      /** Line information of the value. */
      root: JsonNode;
    }
  | {
      ok: false;
      message: string;
      /** 1-based line of the offending character. */
      line: number;
      /** 1-based column (UTF-16 code units) of the offending character. */
      column: number;
    };

/** Maximum nesting depth; deeper documents are rejected instead of exhausting the stack. */
const MAX_DEPTH = 512;

const NUMBER = /-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/y;
const HEX4 = /^[0-9a-fA-F]{4}$/;

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

class JsonSyntaxError extends Error {
  constructor(
    message: string,
    readonly line: number,
    readonly column: number,
  ) {
    super(message);
  }
}

interface Parsed {
  value: unknown;
  node: JsonNode;
}

class Parser {
  #index = 0;
  #line = 1;
  #lineStart = 0;

  constructor(private readonly text: string) {}

  parse(): Parsed {
    this.#skipWhitespace();
    const result = this.#value(0);
    this.#skipWhitespace();
    if (this.#index < this.text.length) this.#fail("Unexpected character after the JSON value");
    return result;
  }

  #fail(message: string): never {
    throw new JsonSyntaxError(message, this.#line, this.#index - this.#lineStart + 1);
  }

  #skipWhitespace(): void {
    const text = this.text;
    while (this.#index < text.length) {
      const code = text.charCodeAt(this.#index);
      if (code === 0x20 || code === 0x09 || code === 0x0d) {
        this.#index++;
      } else if (code === 0x0a) {
        this.#index++;
        this.#line++;
        this.#lineStart = this.#index;
      } else {
        return;
      }
    }
  }

  #value(depth: number): Parsed {
    if (depth > MAX_DEPTH) this.#fail("The document is nested too deeply");
    const line = this.#line;
    const char = this.text[this.#index];
    if (char === undefined) this.#fail("Unexpected end of input");
    if (char === "{") return this.#object(depth, line);
    if (char === "[") return this.#array(depth, line);
    if (char === '"') return { value: this.#string(), node: { line } };
    if (char === "t") return { value: this.#literal("true", true), node: { line } };
    if (char === "f") return { value: this.#literal("false", false), node: { line } };
    if (char === "n") return { value: this.#literal("null", null), node: { line } };
    if (char === "-" || (char >= "0" && char <= "9")) {
      return { value: this.#number(), node: { line } };
    }
    return this.#fail(`Unexpected character ${JSON.stringify(char)}`);
  }

  #object(depth: number, line: number): Parsed {
    this.#index++;
    const value: Record<string, unknown> = {};
    const members = new Map<string, JsonNode>();
    this.#skipWhitespace();
    if (this.text[this.#index] === "}") {
      this.#index++;
      return { value, node: { line, members } };
    }
    for (;;) {
      if (this.text[this.#index] !== '"') this.#fail("Expected a double-quoted property name");
      const keyLine = this.#line;
      const key = this.#string();
      this.#skipWhitespace();
      if (this.text[this.#index] !== ":") this.#fail('Expected ":" after a property name');
      this.#index++;
      this.#skipWhitespace();
      const member = this.#value(depth + 1);
      // Like JSON.parse: an own property even for "__proto__"; a repeated key keeps its first position and
      // takes the last value.
      Object.defineProperty(value, key, {
        value: member.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      members.set(key, { ...member.node, keyLine });
      this.#skipWhitespace();
      const next = this.text[this.#index];
      if (next === ",") {
        this.#index++;
        this.#skipWhitespace();
      } else if (next === "}") {
        this.#index++;
        return { value, node: { line, members } };
      } else {
        this.#fail('Expected "," or "}" after a property value');
      }
    }
  }

  #array(depth: number, line: number): Parsed {
    this.#index++;
    const value: unknown[] = [];
    const elements: JsonNode[] = [];
    this.#skipWhitespace();
    if (this.text[this.#index] === "]") {
      this.#index++;
      return { value, node: { line, elements } };
    }
    for (;;) {
      const element = this.#value(depth + 1);
      value.push(element.value);
      elements.push(element.node);
      this.#skipWhitespace();
      const next = this.text[this.#index];
      if (next === ",") {
        this.#index++;
        this.#skipWhitespace();
      } else if (next === "]") {
        this.#index++;
        return { value, node: { line, elements } };
      } else {
        this.#fail('Expected "," or "]" after an array element');
      }
    }
  }

  #string(): string {
    const text = this.text;
    let index = this.#index + 1;
    let chunkStart = index;
    let result = "";
    for (;;) {
      if (index >= text.length) {
        this.#index = index;
        this.#fail("Unterminated string");
      }
      const code = text.charCodeAt(index);
      if (code === 0x22) {
        this.#index = index + 1;
        return result + text.slice(chunkStart, index);
      }
      if (code === 0x5c) {
        result += text.slice(chunkStart, index);
        const escape = text[index + 1] ?? "";
        const simple = SIMPLE_ESCAPES[escape];
        if (simple !== undefined) {
          result += simple;
          index += 2;
        } else if (escape === "u" && HEX4.test(text.slice(index + 2, index + 6))) {
          result += String.fromCharCode(Number.parseInt(text.slice(index + 2, index + 6), 16));
          index += 6;
        } else {
          this.#index = index;
          this.#fail("Invalid escape sequence in string");
        }
        chunkStart = index;
      } else if (code < 0x20) {
        this.#index = index;
        this.#fail("Unescaped control character in string");
      } else {
        index++;
      }
    }
  }

  #number(): number {
    NUMBER.lastIndex = this.#index;
    const match = NUMBER.exec(this.text);
    if (match === null) this.#fail("Invalid number");
    this.#index += match[0].length;
    return Number(match[0]);
  }

  #literal<T>(word: string, value: T): T {
    if (!this.text.startsWith(word, this.#index)) {
      this.#fail(`Unexpected character ${JSON.stringify(this.text[this.#index] ?? "")}`);
    }
    this.#index += word.length;
    return value;
  }
}

/**
 * Parse JSON text exactly as `JSON.parse` would (same accepted inputs, same resulting value, including
 * duplicate keys and `"__proto__"` members) and record the line of every value and member key.
 * Documents nested more than 512 levels deep are rejected.
 */
export function parseJsonWithPositions(text: string): JsonParseResult {
  try {
    const { value, node } = new Parser(text).parse();
    return { ok: true, value, root: node };
  } catch (error) {
    if (error instanceof JsonSyntaxError) {
      return { ok: false, message: error.message, line: error.line, column: error.column };
    }
    throw error;
  }
}
