import { describe, expect, it } from "vitest";
import type { EdgeEntity, EdgeKind, FileEntity, NodeId, SymbolEntity } from "./index.js";
import { DuplicateIdError } from "./canonical.js";
import { DocumentIndex } from "./document-index.js";
import { emptyDocument } from "./empty.js";
import {
  anomalyId,
  componentId,
  directoryId,
  edgeId,
  endpointId,
  fileId,
  layerId,
  moduleId,
  symbolId,
} from "./ids.js";

const range = { start: { line: 1, column: 1 }, end: { line: 2, column: 1 } };

function file(path: string, symbols: SymbolEntity[] = []): FileEntity {
  return {
    id: fileId(path),
    path,
    name: path,
    directory: directoryId(""),
    language: "typescript",
    role: "source",
    size: 1,
    analysis: { status: "parsed" },
    symbols: symbols.map((s) => s.id),
    imports: [],
    exports: [],
    tags: [],
  };
}

function symbol(path: string, qualifiedName: string, parent?: string): SymbolEntity {
  const entity: SymbolEntity = {
    id: symbolId(path, qualifiedName),
    name: qualifiedName.split(".").pop() ?? qualifiedName,
    qualifiedName,
    kind: parent === undefined ? "class" : "method",
    category: parent === undefined ? "type" : "callable",
    file: fileId(path),
    range,
    exported: true,
  };
  if (parent !== undefined) entity.parent = symbolId(path, parent);
  return entity;
}

function edge(kind: EdgeKind, source: NodeId, target: NodeId): EdgeEntity {
  return {
    id: edgeId(kind, source, target),
    kind,
    source,
    target,
    observations: 1,
    typeOnly: false,
    confidence: 1,
    provenance: [],
  };
}

function buildDocument() {
  const service = symbol("service.ts", "PaymentService");
  const charge = symbol("service.ts", "PaymentService.charge", "PaymentService");
  const controller = symbol("controller.ts", "PaymentController");
  const doc = emptyDocument();
  doc.files = [file("service.ts", [service, charge]), file("controller.ts", [controller])];
  doc.symbols = [service, charge, controller];
  doc.edges = [
    // Deliberately not in canonical order.
    edge("references-type", controller.id, service.id),
    edge("calls", controller.id, charge.id),
    edge("imports", fileId("controller.ts"), fileId("service.ts")),
    // File-scope code in controller.ts also calls charge().
    edge("calls", fileId("controller.ts"), charge.id),
  ];
  doc.modules = [
    {
      id: moduleId("payments"),
      name: "payments",
      origin: "declared",
      packages: [],
      files: [fileId("controller.ts"), fileId("service.ts")],
      components: [componentId("")],
      entryPoints: [],
      publicApi: [],
      dependencies: [],
      dependents: [],
    },
  ];
  doc.layers = [
    {
      id: layerId("controller"),
      name: "controller",
      origin: "inferred",
      rank: 0,
      files: [fileId("controller.ts")],
      dependencies: [],
      dependents: [],
    },
  ];
  const getPayment = endpointId("http", "GET", "/payments/:id", controller.id);
  doc.endpoints = [
    {
      id: getPayment,
      protocol: "http",
      method: "GET",
      path: "/payments/:id",
      pathComplete: true,
      framework: "nestjs",
      handler: controller.id,
      location: { file: fileId("controller.ts"), line: 1, column: 1 },
      inference: { confidence: 0.9, method: "test", reason: "test", evidence: [] },
    },
  ];
  doc.anomalies = [
    {
      id: anomalyId("hub", [service.id]),
      type: "hub",
      severity: "info",
      level: "symbol",
      subjects: [service.id],
      title: "Hub",
      description: "A hub.",
      evidence: [],
      confidence: 0.5,
      edges: [],
      locations: [],
    },
  ];
  return { doc, service, charge, controller, getPayment };
}

describe("DocumentIndex", () => {
  it("looks entities up by id and path", () => {
    const { doc, service } = buildDocument();
    const index = new DocumentIndex(doc);
    expect(index.file(fileId("service.ts"))?.path).toBe("service.ts");
    expect(index.fileByPath("controller.ts")?.id).toBe(fileId("controller.ts"));
    expect(index.symbol(service.id)?.kind).toBe("class");
    expect(index.has(fileId("missing.ts"))).toBe(false);
    expect(index.edge(edgeId("imports", fileId("controller.ts"), fileId("service.ts")))?.kind).toBe(
      "imports",
    );
  });

  it("returns adjacency in canonical edge order", () => {
    const { doc, controller } = buildDocument();
    const index = new DocumentIndex(doc);
    expect(index.outgoing(controller.id).map((e) => `${e.target}:${e.kind}`)).toEqual([
      `${symbolId("service.ts", "PaymentService")}:references-type`,
      `${symbolId("service.ts", "PaymentService.charge")}:calls`,
    ]);
  });

  it("answers adjacency queries with distinct, sorted results", () => {
    const { doc, controller, charge } = buildDocument();
    const index = new DocumentIndex(doc);
    expect(index.dependencies(controller.id)).toEqual([
      symbolId("service.ts", "PaymentService"),
      symbolId("service.ts", "PaymentService.charge"),
    ]);
    expect(index.dependencies(controller.id, new Set<EdgeKind>(["calls"]))).toEqual([charge.id]);
    expect(index.dependents(fileId("service.ts"))).toEqual([fileId("controller.ts")]);
    expect(index.incoming(charge.id)).toHaveLength(2);
  });

  it("navigates containment and architecture", () => {
    const { doc, service, charge, controller, getPayment } = buildDocument();
    const index = new DocumentIndex(doc);
    expect(index.symbolsOf(fileId("service.ts")).map((s) => s.qualifiedName)).toEqual([
      "PaymentService",
      "PaymentService.charge",
    ]);
    expect(index.childrenOf(service.id)).toEqual([charge.id]);
    expect(index.fileOf(charge.id)).toBe(fileId("service.ts"));
    expect(index.fileOf(fileId("service.ts"))).toBe(fileId("service.ts"));
    expect(index.fileOf("ext:npm:react")).toBeUndefined();
    expect(index.moduleOf(fileId("service.ts"))).toBe(moduleId("payments"));
    expect(index.layerOf(fileId("controller.ts"))).toBe(layerId("controller"));
    expect(index.layerOf(fileId("service.ts"))).toBeUndefined();
    expect(index.endpointsOf(controller.id)).toEqual([getPayment]);
  });

  it("finds anomalies by subject", () => {
    const { doc, service, controller } = buildDocument();
    const index = new DocumentIndex(doc);
    expect(index.anomaliesFor(service.id).map((a) => a.type)).toEqual(["hub"]);
    expect(index.anomaliesFor(controller.id)).toEqual([]);
    expect(index.violationsFor(controller.id)).toEqual([]);
  });

  it("rejects duplicate identifiers", () => {
    const { doc } = buildDocument();
    doc.files.push(file("service.ts"));
    expect(() => new DocumentIndex(doc)).toThrow(DuplicateIdError);
  });
});
