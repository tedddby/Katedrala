import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asciiLower, fileStem, nameParts, pluralize, sStem, tokenize } from "./lexical.js";
import { resolveInferenceSettings } from "./settings.js";

const vocabulary = resolveInferenceSettings().vocabulary;
const keys = (text: string): string[] => tokenize(text).map((token) => token.key);
const texts = (text: string): string[] => tokenize(text).map((token) => token.text);

/** Every ASCII character that is neither a letter nor a digit: the separators of D-05. */
const ASCII_SEPARATORS = Array.from({ length: 128 }, (_, code) => String.fromCharCode(code)).filter(
  (character) => !/[A-Za-z0-9]/.test(character),
);

describe("asciiLower (D-05)", () => {
  it("folds A–Z only", () => {
    expect(asciiLower("PaymentController")).toBe("paymentcontroller");
    expect(asciiLower("HTTP/2 #A~Z%")).toBe("http/2 #a~z%");
    expect(asciiLower("ÉTÉ-Été")).toBe("ÉtÉ-Été");
    expect(asciiLower("İSTANBUL")).toBe("İstanbul");
    expect(asciiLower("ΣΟΦΙΑ")).toBe("ΣΟΦΙΑ");
    expect(asciiLower("")).toBe("");
  });

  it("changes nothing but A–Z and is idempotent", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 24 }), (text) => {
        const lower = asciiLower(text);
        expect(lower).toHaveLength(text.length);
        expect(asciiLower(lower)).toBe(lower);
        for (let i = 0; i < text.length; i++) {
          const code = text.charCodeAt(i);
          const expected = code >= 65 && code <= 90 ? code + 32 : code;
          expect(lower.charCodeAt(i)).toBe(expected);
        }
      }),
      { seed: 20261007, numRuns: 300 },
    );
  });
});

describe("tokenize (§1.4, D-05)", () => {
  it("splits on separators and ASCII camel-case boundaries", () => {
    expect(tokenize("OrderLine")).toEqual([
      { text: "Order", key: "order" },
      { text: "Line", key: "line" },
    ]);
    expect(keys("HTTPServer")).toEqual(["http", "server"]);
    expect(texts("HTTPServer")).toEqual(["HTTP", "Server"]);
    expect(keys("v2Api")).toEqual(["v2", "api"]);
    expect(keys("payment-gateway")).toEqual(["payment", "gateway"]);
    expect(keys("order_line.item")).toEqual(["order", "line", "item"]);
    expect(keys("  user  profile ")).toEqual(["user", "profile"]);
    expect(keys("getHTTPResponseCode")).toEqual(["get", "http", "response", "code"]);
    expect(keys("HTTP2Server")).toEqual(["http2", "server"]);
    expect(keys("abc123def")).toEqual(["abc123def"]);
    expect(keys("ALLCAPS")).toEqual(["allcaps"]);
    expect(keys("a@b+c$d!e")).toEqual(["a", "b", "c", "d", "e"]);
    expect(tokenize("")).toEqual([]);
    expect(tokenize("--__..")).toEqual([]);
  });

  it("keeps non-ASCII characters as letters, without case folding or camel-case splits", () => {
    expect(tokenize("Été-Facture")).toEqual([
      { text: "Été", key: "Été" },
      { text: "Facture", key: "facture" },
    ]);
    expect(texts("ÜberService")).toEqual(["Über", "Service"]);
    expect(keys("schönÖl")).toEqual(["schönÖl"]);
    expect(keys("ÉCOLE")).toEqual(["École"]);
    expect(keys("École")).toEqual(["École"]);
    expect(keys("école")).toEqual(["école"]);
    expect(keys("straßeName")).toEqual(["straße", "name"]);
    // Astral characters (surrogate pairs) are kept whole.
    expect(texts("order📦box")).toEqual(["order📦box"]);
    expect(texts("日本語-テスト")).toEqual(["日本語", "テスト"]);
    // The class boundaries of D-05: U+007F (DEL) is an ASCII separator, U+0080 to U+FFFF are letters.
    expect(texts("a\u007Fb")).toEqual(["a", "b"]);
    expect(texts("a\u0080b")).toEqual(["a\u0080b"]);
    expect(texts("a￿b")).toEqual(["a￿b"]);
  });

  it("never yields empty tokens or tokens containing an ASCII separator", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 32 }), (text) => {
        const tokens = tokenize(text);
        for (const token of tokens) {
          expect(token.text).not.toBe("");
          expect(token.key).toBe(asciiLower(token.text));
          for (const separator of ASCII_SEPARATORS) expect(token.text).not.toContain(separator);
        }
        // Tokenization only removes separators: the tokens spell the text without them.
        let kept = "";
        for (let i = 0; i < text.length; i++) {
          if (!ASCII_SEPARATORS.includes(text.charAt(i))) kept += text.charAt(i);
        }
        expect(tokens.map((token) => token.text).join("")).toBe(kept);
      }),
      { seed: 20261007, numRuns: 500 },
    );
  });
});

describe("sStem (§1.4, Harman 1991)", () => {
  it.each([
    // The §9.1 table.
    ["payments", "payment"],
    ["categories", "category"],
    ["addresses", "address"],
    ["status", "status"],
    ["bus", "bus"],
    // Rule 1, and its guards.
    ["utilities", "utility"],
    ["pies", "pie"],
    ["ties", "tie"],
    ["movies", "movy"],
    ["series", "sery"],
    // Rule 2: sibilants.
    ["classes", "class"],
    ["boxes", "box"],
    ["dishes", "dish"],
    ["buzzes", "buzz"],
    // Rule 3, and the endings it excludes (rule 4 then applies).
    ["services", "service"],
    ["routes", "route"],
    ["toes", "toe"],
    ["trees", "tree"],
    ["algaes", "algae"],
    // Rule 4, and its guards.
    ["controllers", "controller"],
    ["ids", "ids"],
    ["gas", "gas"],
    ["class", "class"],
    ["corpus", "corpus"],
    // Rule 5.
    ["payment", "payment"],
    ["index", "index"],
    ["s", "s"],
    ["", ""],
  ])("%s → %s", (word, stem) => {
    expect(sStem(word)).toBe(stem);
  });

  it("applies the rules to the ASCII-lower-cased word", () => {
    expect(sStem("Payments")).toBe("payment");
    expect(sStem("CATEGORIES")).toBe("category");
    expect(sStem("Services")).toBe("service");
    expect(sStem("ÉtÉs")).toBe("ÉtÉ");
  });

  it("is idempotent, case-insensitive for ASCII and never lengthens", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[A-Za-z]{0,10}$/), (word) => {
        const stem = sStem(word);
        expect(sStem(stem)).toBe(stem);
        expect(sStem(asciiLower(word))).toBe(stem);
        expect(stem.length).toBeLessThanOrEqual(word.length);
      }),
      { seed: 20261007, numRuns: 1000 },
    );
  });
});

describe("nameParts (§1.4)", () => {
  it("strips the last extension and splits head and qualifiers", () => {
    expect(nameParts("payment.controller.ts")).toEqual({
      head: "payment",
      qualifiers: ["controller"],
    });
    expect(nameParts("src/orders/Orders.Routes.ts")).toEqual({
      head: "Orders",
      qualifiers: ["routes"],
    });
    expect(nameParts("PaymentService.ts")).toEqual({ head: "PaymentService", qualifiers: [] });
    expect(nameParts("index.d.ts")).toEqual({ head: "index", qualifiers: ["d"] });
    expect(nameParts("Makefile")).toEqual({ head: "Makefile", qualifiers: [] });
    expect(nameParts("a.b.c.d.js")).toEqual({ head: "a", qualifiers: ["b", "c", "d"] });
  });

  it("does not treat a leading dot as an extension, like extensionOf", () => {
    expect(nameParts(".eslintrc")).toEqual({ head: "", qualifiers: ["eslintrc"] });
    expect(nameParts("config/.env.ts")).toEqual({ head: "", qualifiers: ["env"] });
  });
});

describe("fileStem (§1.4, D-06, D-09)", () => {
  it.each([
    ["src/payments/payment-gateway.ts", "payment", "payment"],
    ["src/OrderService.ts", "order", "Order"],
    ["src/order-line.ts", "order", "order"],
    ["src/controllers/payments.controller.ts", "payment", "payments"],
    ["src/models/Category.ts", "category", "Category"],
    ["src/server/HTTPServer.ts", "http", "HTTP"],
    ["src/Été-facture.ts", "Été", "Été"],
    ["src/tasks/task.controller.ts", "task", "task"],
  ])("%s → %s (%s)", (path, stem, original) => {
    expect(fileStem(path, vocabulary)).toEqual({ stem, original });
  });

  it.each([
    ["src/index.ts", "a generic token"],
    ["src/utils.ts", "a generic token after stemming"],
    ["src/dto.ts", "a naming-suffix key"],
    ["src/controllers/controller.ts", "a naming-suffix key"],
    ["src/main.ts", "a generic token"],
    ["src/a.ts", "shorter than two characters"],
    ["src/é.ts", "shorter than two characters"],
    ["src/.eslintrc", "an empty head"],
    ["src/__init__.py", "a generic token"],
  ])("%s has no stem (%s)", (path) => {
    expect(fileStem(path, vocabulary)).toBeUndefined();
  });

  it("excludes naming-suffix keys that are not generic tokens (D-09)", () => {
    const custom = resolveInferenceSettings({
      layers: { naming_suffixes: { facades: "x-facade" } },
    }).vocabulary;
    expect(vocabulary.genericTokens.has("facade")).toBe(false);
    expect(fileStem("src/facade.ts", vocabulary)).toEqual({ stem: "facade", original: "facade" });
    expect(fileStem("src/facades.ts", custom)).toBeUndefined();
    // Directory-layer keys are not role tokens: a todo app's `task` is a feature (D-09).
    expect(fileStem("src/data.ts", vocabulary)).toEqual({ stem: "data", original: "data" });
  });

  it("follows configured generic tokens, removals included", () => {
    const custom = resolveInferenceSettings({
      modules: { generic_tokens: ["Payments", "!index"] },
    }).vocabulary;
    expect(fileStem("src/payment.ts", custom)).toBeUndefined();
    expect(fileStem("src/index.ts", custom)).toEqual({ stem: "index", original: "index" });
  });
});

describe("pluralize (§3.10)", () => {
  it.each([
    ["payment", "payments"],
    ["category", "categories"],
    ["address", "addresses"],
    ["box", "boxes"],
    ["quiz", "quizes"],
    ["church", "churches"],
    ["dish", "dishes"],
    ["bus", "buses"],
    ["day", "days"],
    ["key", "keys"],
    ["toy", "toys"],
    ["order", "orders"],
    ["y", "ys"],
    ["", ""],
  ])("%s → %s", (word, plural) => {
    expect(pluralize(word)).toBe(plural);
  });

  it("preserves the case of the input", () => {
    expect(pluralize("Payment")).toBe("Payments");
    expect(pluralize("Category")).toBe("Categories");
    expect(pluralize("CATEGORY")).toBe("CATEGORIES");
    expect(pluralize("SKU")).toBe("SKUs");
    expect(pluralize("BOX")).toBe("BOXes");
    expect(pluralize("OrderItem")).toBe("OrderItems");
  });

  it("matches ASCII letters only (D-05)", () => {
    expect(pluralize("éy")).toBe("éys");
    expect(pluralize("2y")).toBe("2ys");
    expect(pluralize("Été")).toBe("Étés");
  });
});
