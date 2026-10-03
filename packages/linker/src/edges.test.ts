import { compareEdges, edgeId } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import {
  exportLocal,
  extraction,
  fact,
  fid,
  file,
  findEdge,
  imp,
  instance,
  member,
  ref,
  run,
  sid,
  sym,
  typeRef,
  use,
} from "./test-support.js";

const MAIN = sid("src/main.ts", "main");
const FN = sid("src/t.ts", "fn");

const target = file(
  "src/t.ts",
  extraction({
    symbols: [
      sym("fn", "function"),
      sym("T", "class"),
      member("T", "m", "method"),
      sym("getT", "function", { returnType: typeRef(ref.symbol("T")) }),
      sym("Shape", "type-alias"),
    ],
    exports: [
      exportLocal("fn", ref.symbol("fn")),
      exportLocal("T", ref.symbol("T")),
      exportLocal("getT", ref.symbol("getT")),
      exportLocal("Shape", ref.symbol("Shape")),
    ],
  }),
);

function caller(references: ReturnType<typeof use>[]) {
  return file(
    "src/main.ts",
    extraction({
      symbols: [sym("main", "function"), sym("other", "function")],
      imports: [imp("./t", ["fn", "T", "getT", "Shape"])],
      references,
    }),
  );
}

const threeCalls = [
  use("call", ref.import("fn"), { from: "main", line: 9, column: 1 }),
  use("call", ref.import("fn"), { from: "main", line: 3, column: 7 }),
  use("call", ref.import("fn"), { from: "main", line: 3, column: 2 }),
];

describe("aggregation", () => {
  it("aggregates observations of one kind between two nodes into one edge", async () => {
    const result = await run([target, caller(threeCalls)]);
    const edge = findEdge(result, "calls", MAIN, FN);
    expect(edge).toEqual({
      id: edgeId("calls", MAIN, FN),
      kind: "calls",
      source: MAIN,
      target: FN,
      observations: 3,
      typeOnly: false,
      confidence: 1,
      provenance: [3, 3, 9].map((line, index) => ({
        file: "file:src/main.ts",
        line,
        column: [2, 7, 1][index],
        mechanism: "call-expression",
        resolution: "import-binding",
        confidence: 1,
      })),
    });
  });

  it("truncates provenance to the limit while counting every observation", async () => {
    const limited = await run([target, caller(threeCalls)], {
      limits: { maxProvenancePerEdge: 2 },
    });
    const edge = findEdge(limited, "calls", MAIN, FN);
    expect(edge?.observations).toBe(3);
    expect(edge?.provenance.map((item) => [item.line, item.column])).toEqual([
      [3, 2],
      [3, 7],
    ]);
    const none = await run([target, caller(threeCalls)], { limits: { maxProvenancePerEdge: 0 } });
    expect(findEdge(none, "calls", MAIN, FN)).toMatchObject({ observations: 3, provenance: [] });
    const unbounded = await run([target, caller(threeCalls)], {
      limits: { maxProvenancePerEdge: null },
    });
    expect(findEdge(unbounded, "calls", MAIN, FN)?.provenance).toHaveLength(3);
  });

  it("keeps different kinds between the same nodes as separate edges", async () => {
    const result = await run([
      target,
      caller([
        use("call", ref.import("T"), { from: "main", line: 1 }),
        use("type", ref.import("T"), { from: "main", line: 2, typeOnly: true }),
        use("value", ref.import("T"), { from: "main", line: 3 }),
      ]),
    ]);
    expect(result.edges.filter((edge) => edge.source === MAIN).map((edge) => edge.kind)).toEqual([
      "instantiates",
      "references-type",
      "uses",
    ]);
  });

  it("marks an edge type-only only when every observation is type-only", async () => {
    const result = await run([
      target,
      caller([
        use("type", ref.import("Shape"), { from: "main", line: 1, typeOnly: true }),
        use("type", ref.import("Shape"), { from: "main", line: 2, typeOnly: true }),
        use("type", ref.import("T"), { from: "main", line: 3, typeOnly: true }),
        use("type", ref.import("T"), { from: "main", line: 4 }),
      ]),
    ]);
    expect(findEdge(result, "references-type", MAIN, sid("src/t.ts", "Shape"))?.typeOnly).toBe(
      true,
    );
    const mixed = findEdge(result, "references-type", MAIN, sid("src/t.ts", "T"));
    expect(mixed?.typeOnly).toBe(false);
    expect(mixed?.provenance.map((item) => item.typeOnly)).toEqual([true, undefined]);
  });

  it("uses the highest observation confidence", async () => {
    const result = await run([
      target,
      caller([
        use("call", instance("call-result", ref.import("getT"), "m"), { from: "main", line: 1 }),
        use("call", instance("declared-type", ref.import("T"), "m"), { from: "main", line: 2 }),
        use("call", ref.import("T", "m", "missing"), { from: "other", line: 3 }),
      ]),
    ]);
    const edge = findEdge(result, "calls", MAIN, sid("src/t.ts", "T.m"));
    expect(edge?.confidence).toBe(0.9);
    expect(edge?.provenance.map((item) => [item.resolution, item.confidence])).toEqual([
      ["return-type", 0.8],
      ["declared-type", 0.9],
    ]);
    expect(
      findEdge(result, "calls", sid("src/main.ts", "other"), sid("src/t.ts", "T.m"))?.confidence,
    ).toBe(0.7);
  });

  it("returns edges in canonical order (source, target, kind)", async () => {
    const result = await run([
      target,
      caller([
        use("call", ref.import("fn"), { from: "other" }),
        use("value", ref.import("fn"), { from: "main" }),
        use("call", ref.import("fn"), { from: "main" }),
        use("new", ref.import("T"), { from: "main" }),
      ]),
    ]);
    expect([...result.edges].sort(compareEdges)).toEqual(result.edges);
    // file:… before sym:…; within main, sym:src/t.ts#T sorts before sym:src/t.ts#fn.
    expect(result.edges.map((edge) => edge.kind)).toEqual([
      "imports",
      "instantiates",
      "calls",
      "uses",
      "calls",
    ]);
  });
});

describe("file-level relationships", () => {
  const files = [
    target,
    file(
      "src/main.ts",
      extraction({
        symbols: [sym("main", "function"), sym("other", "function"), sym("helper", "function")],
        imports: [imp("./t", ["fn"], { line: 1 })],
        references: [
          use("call", ref.import("fn"), { from: "main", line: 5 }),
          use("call", ref.import("fn"), { from: "other", line: 8 }),
          use("call", ref.symbol("helper"), { from: "main", line: 6 }),
        ],
        facts: [fact("environment-read", { name: "PORT" }, { from: "main", line: 7 })],
      }),
    ),
  ];

  it("lifts symbol endpoints to files and drops the resulting self-loops", async () => {
    const result = await run(files, { detail: { relationships: "file" } });
    expect(
      result.edges.map((edge) => [edge.kind, edge.source, edge.target, edge.observations]),
    ).toEqual([
      ["reads-configuration", "file:src/main.ts", "ext:env:PORT", 1],
      ["calls", "file:src/main.ts", "file:src/t.ts", 2],
      ["imports", "file:src/main.ts", "file:src/t.ts", 1],
    ]);
    // Symbols are still listed.
    expect(result.symbols).toHaveLength(8);
  });

  it("omits symbols and every reference to them when detail.symbols is false", async () => {
    const result = await run(
      [
        target,
        file(
          "src/main.ts",
          extraction({
            symbols: [sym("main", "function")],
            imports: [
              imp("./t", ["fn"], { from: "main", kind: "dynamic", mechanism: "dynamic-import" }),
            ],
            references: [use("call", ref.import("fn"), { from: "main" })],
            exports: [exportLocal("main", ref.symbol("main"))],
            facts: [fact("entry-point", { kind: "main" }, { from: "main" })],
          }),
        ),
      ],
      { detail: { symbols: false } },
    );
    expect(result.symbols).toEqual([]);
    expect(result.stats.symbols).toBe(0);
    expect(result.files.map((entry) => entry.symbols)).toEqual([[], []]);
    const main = result.files.find((entry) => entry.path === "src/main.ts");
    expect(main?.imports[0]?.from).toBeUndefined();
    expect(main?.exports).toEqual([{ name: "main", typeOnly: false }]);
    expect(result.entryPoints).toEqual([
      { entity: fid("src/main.ts"), kind: "convention", source: "fake" },
    ]);
    expect(result.edges.map((edge) => [edge.kind, edge.source, edge.target])).toEqual([
      ["calls", "file:src/main.ts", "file:src/t.ts"],
      ["imports", "file:src/main.ts", "file:src/t.ts"],
    ]);
  });
});

describe("facts", () => {
  it("turns environment reads and HTTP requests into externals and edges", async () => {
    const result = await run([
      file(
        "src/client.ts",
        extraction({
          symbols: [sym("charge", "function")],
          facts: [
            fact(
              "environment-read",
              { name: "STRIPE_SECRET_KEY" },
              { from: "charge", line: 2, column: 5 },
            ),
            fact("environment-read", { name: "STRIPE_SECRET_KEY" }, { line: 1 }),
            fact("environment-read", {}),
            fact(
              "http-request",
              {
                client: "fetch",
                url: "https://api.stripe.com/v1/charges",
                host: "api.stripe.com",
                method: "POST",
              },
              { from: "charge", line: 3, column: 9 },
            ),
            fact("http-request", { client: "fetch", host: "example.com" }, { line: 4 }),
            fact("http-request", { client: "fetch", url: "/relative" }, { line: 5 }),
            fact("x-acme-thing", { name: "ignored" }),
          ],
        }),
      ),
    ]);
    expect(result.externals).toEqual([
      {
        id: "ext:env:STRIPE_SECRET_KEY",
        kind: "environment-variable",
        namespace: "env",
        name: "STRIPE_SECRET_KEY",
      },
      { id: "ext:http:api.stripe.com", kind: "service", namespace: "http", name: "api.stripe.com" },
      { id: "ext:http:example.com", kind: "service", namespace: "http", name: "example.com" },
    ]);
    const charge = sid("src/client.ts", "charge");
    expect(
      findEdge(result, "reads-configuration", charge, "ext:env:STRIPE_SECRET_KEY")?.provenance,
    ).toEqual([
      {
        file: "file:src/client.ts",
        line: 2,
        column: 5,
        mechanism: "environment-read",
        resolution: "global-scope",
        confidence: 1,
      },
    ]);
    expect(
      findEdge(result, "reads-configuration", "file:src/client.ts", "ext:env:STRIPE_SECRET_KEY"),
    ).toBeDefined();
    expect(
      findEdge(result, "calls-service", charge, "ext:http:api.stripe.com")?.provenance,
    ).toEqual([
      {
        file: "file:src/client.ts",
        line: 3,
        column: 9,
        mechanism: "http-request",
        resolution: "global-scope",
        confidence: 0.9,
        detail: "POST https://api.stripe.com/v1/charges",
      },
    ]);
    expect(
      findEdge(result, "calls-service", "file:src/client.ts", "ext:http:example.com")?.provenance[0]
        ?.detail,
    ).toBeUndefined();
    expect(result.edges).toHaveLength(4);
  });
});
