import { compareStrings, fileId, roundMetric, symbolId } from "@katedrala/ir";
import type { ArchitecturalRole, FileEntity, FileId, RoleEntry } from "@katedrala/ir";
import { ArchitectureModel } from "@katedrala/model";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { INFERRED_ROLE_SOURCES, VOTE_CONFIDENCES, inferRoles, withRoles } from "./roles.js";
import { resolveInferenceSettings } from "./settings.js";
import { prototypeModel, shuffledModel, syntheticModel } from "./test-support.js";
import type { SyntheticFileSpec, SyntheticModelSpec } from "./test-support.js";
import type {
  ConfiguredRoleSpec,
  FileLabel,
  InferenceConfiguration,
  RolesResult,
} from "./types.js";

const SETTINGS = resolveInferenceSettings();

function rolesOf(
  spec: SyntheticModelSpec,
  configured: readonly ConfiguredRoleSpec[] = [],
  config?: InferenceConfiguration,
): RolesResult {
  const settings = config === undefined ? SETTINGS : resolveInferenceSettings(config);
  return inferRoles({ model: syntheticModel(spec), settings, configured });
}

/** The label of `path`; fails when the file has none. */
function labelOf(result: RolesResult, path: string): FileLabel {
  const label = result.labels.get(fileId(path));
  if (label === undefined) throw new Error(`No label for ${path}`);
  return label;
}

/** `role/source confidence` per entry of `path`. */
function entriesOf(result: RolesResult, path: string): string[] {
  return (result.roles.get(fileId(path)) ?? []).map(
    (entry) => `${entry.role}/${entry.source} ${entry.confidence}`,
  );
}

/** `label source signal confidence` per vote. */
function votesOf(label: FileLabel): string[] {
  return label.votes.map(
    (vote) => `${vote.label ?? "⊥"} ${vote.source} ${vote.signal} ${vote.confidence}`,
  );
}

/** A detector's role entry. */
function detected(role: ArchitecturalRole, source: string, confidence: number): RoleEntry {
  return { role, source, confidence, evidence: [] };
}

describe("inferRoles: the vote sources (§4.2, plan 4.3)", () => {
  it("uses the documented confidences", () => {
    expect(VOTE_CONFIDENCES).toEqual({
      configuration: 1,
      nameQualifier: 0.8,
      nameSuffix: 0.6,
      typeNameSuffix: 0.6,
      location: 0.7,
    });
    expect([...INFERRED_ROLE_SOURCES]).toEqual(["configuration", "location", "naming"]);
  });

  it("votes for a configured role with confidence 1", () => {
    const result = rolesOf({ files: ["src/a.ts", "src/b.ts"] }, [
      { role: "service", files: [fileId("src/a.ts")] },
      { role: "utility", files: [fileId("src/a.ts")] },
    ]);
    const label = labelOf(result, "src/a.ts");
    expect(label.votes).toEqual([
      {
        label: null,
        confidence: 1,
        source: "configuration",
        producer: "configuration",
        role: "utility",
        signal: "configured-glob",
      },
      {
        label: "service",
        confidence: 1,
        source: "configuration",
        producer: "configuration",
        role: "service",
        signal: "configured-glob",
      },
    ]);
    // ⊥ and service tie at 1 with the same precedence: ⊥ wins (D-19).
    expect(label).toMatchObject({ label: null, score: 1 });
    expect(result.roles.get(fileId("src/a.ts"))).toEqual([
      {
        role: "service",
        confidence: 1,
        source: "configuration",
        evidence: [
          {
            signal: "configured-glob",
            description: "The file matches `inference.roles.service`.",
            value: 1,
          },
        ],
      },
      {
        role: "utility",
        confidence: 1,
        source: "configuration",
        evidence: [
          {
            signal: "configured-glob",
            description: "The file matches `inference.roles.utility`.",
            value: 1,
          },
        ],
      },
    ]);
    expect(result.labels.has(fileId("src/b.ts"))).toBe(false);
  });

  it("lets detector entries vote with their own confidence and writes no entry for them", () => {
    const result = rolesOf({
      files: [{ path: "src/a.ts", roles: [detected("http-controller", "nestjs", 0.9)] }],
    });
    expect(labelOf(result, "src/a.ts")).toEqual({
      file: "file:src/a.ts",
      votes: [
        {
          label: "controller",
          confidence: 0.9,
          source: "detector",
          producer: "nestjs",
          role: "http-controller",
          signal: "detector-role",
          subject: "file:src/a.ts",
        },
      ],
      label: "controller",
      score: 0.9,
    });
    expect(result.roles.has(fileId("src/a.ts"))).toBe(false);
  });

  it("votes for the last qualifier the naming vocabulary knows, after stemming (D-15)", () => {
    const result = rolesOf({
      files: [
        "src/a/payment.controller.ts",
        "src/a/orders.routes.ts",
        "src/a/user.service.mock.ts",
        "src/a/a.service.controller.ts",
        "src/a/Payment.Controller.ts",
        "src/a/plain.ts",
      ],
    });
    expect(votesOf(labelOf(result, "src/a/payment.controller.ts"))).toEqual([
      "controller naming name-qualifier 0.8",
    ]);
    expect(votesOf(labelOf(result, "src/a/orders.routes.ts"))).toEqual([
      "route naming name-qualifier 0.8",
    ]);
    // `mock` is no naming suffix, so `service` is the last qualifier that votes.
    expect(votesOf(labelOf(result, "src/a/user.service.mock.ts"))).toEqual([
      "service naming name-qualifier 0.8",
    ]);
    expect(votesOf(labelOf(result, "src/a/a.service.controller.ts"))).toEqual([
      "controller naming name-qualifier 0.8",
    ]);
    // Qualifiers are ASCII-lower-cased; the head is not a qualifier.
    expect(votesOf(labelOf(result, "src/a/Payment.Controller.ts"))).toEqual([
      "controller naming name-qualifier 0.8",
    ]);
    expect(result.labels.has(fileId("src/a/plain.ts"))).toBe(false);
    expect(entriesOf(result, "src/a/payment.controller.ts")).toEqual([
      "http-controller/naming 0.8",
    ]);
  });

  it("votes for the last word of a head of two or more words (D-15)", () => {
    const result = rolesOf({
      files: [
        "src/a/payment-service.ts",
        "src/a/PaymentService.ts",
        "src/a/payment_repositories.ts",
        "src/a/dto.ts",
        "src/a/service.ts",
        "src/a/service-payment.ts",
      ],
    });
    for (const path of ["src/a/payment-service.ts", "src/a/PaymentService.ts"]) {
      expect(votesOf(labelOf(result, path))).toEqual(["service naming name-suffix 0.6"]);
    }
    expect(votesOf(labelOf(result, "src/a/payment_repositories.ts"))).toEqual([
      "repository naming name-suffix 0.6",
    ]);
    // `dto.ts` is not "a file ending in dto"; only the last word counts.
    for (const path of ["src/a/dto.ts", "src/a/service.ts", "src/a/service-payment.ts"]) {
      expect(result.labels.has(fileId(path))).toBe(false);
    }
  });

  it("votes for the last word of each exported top-level class (D-16)", () => {
    const result = rolesOf({
      files: [
        {
          path: "src/a/payment.ts",
          classes: ["PaymentRepository", "PaymentGatewayClient"],
          symbols: [
            { name: "Hidden", kind: "class", exported: false },
            { name: "HiddenService", kind: "class", exported: false },
            { name: "PaymentRepository.InnerService", kind: "class", parent: "PaymentRepository" },
            { name: "createUserService", kind: "function" },
            { name: "TestOnlyService", kind: "class", role: "test" },
          ],
        },
        { path: "src/a/plain.ts", classes: ["Service", "Gateway"] },
      ],
    });
    const label = labelOf(result, "src/a/payment.ts");
    expect(label.votes.map((vote) => [vote.label, vote.signal, vote.subject])).toEqual([
      ["client", "type-name-suffix", symbolId("src/a/payment.ts", "PaymentGatewayClient")],
      ["repository", "type-name-suffix", symbolId("src/a/payment.ts", "PaymentRepository")],
    ]);
    // Two labels tie at 0.6: the smaller name wins.
    expect(label).toMatchObject({ label: "client", score: 0.6 });
    expect(entriesOf(result, "src/a/payment.ts")).toEqual([
      "external-client/naming 0.6",
      "repository/naming 0.6",
    ]);
    // D-15 also for classes: a one-word class name is no suffix.
    expect(result.labels.has(fileId("src/a/plain.ts"))).toBe(false);
  });

  it("has no class-name votes without symbols (D-16: `detail.symbols = false`)", () => {
    const result = inferRoles({
      model: prototypeModel("clean-architecture"),
      settings: SETTINGS,
      configured: [],
    });
    const signals = [...result.labels.values()].flatMap((label) =>
      label.votes.map((vote) => vote.signal),
    );
    expect(signals).not.toContain("type-name-suffix");
    expect(signals).toContain("directory-name");
  });

  it("votes for the outermost layer directory below the source root (D-18)", () => {
    const result = rolesOf({
      files: [
        "src/index.ts",
        "src/api/controllers/orders.ts",
        "src/features/repositories/x.ts",
        "src/controllers/order.controller.ts",
      ],
    });
    const label = labelOf(result, "src/api/controllers/orders.ts");
    expect(label.votes).toEqual([
      {
        label: "api",
        confidence: 0.7,
        source: "location",
        producer: "location",
        signal: "directory-name",
        subject: "dir:src/api",
      },
    ]);
    expect(label).toMatchObject({
      label: "api",
      score: 0.7,
      location: { label: "api", directory: "src/api" },
    });
    // `features` is a container, so `repositories` is the outermost layer directory.
    expect(labelOf(result, "src/features/repositories/x.ts").location).toEqual({
      label: "repository",
      directory: "src/features/repositories",
    });
    expect(entriesOf(result, "src/features/repositories/x.ts")).toEqual([
      "repository/location 0.7",
    ]);
    expect(result.labels.has(fileId("src/index.ts"))).toBe(false);
  });

  it("never takes the source root itself as a location", () => {
    // The source root descends into `controllers`, so its files lie directly in the root.
    const result = rolesOf({ files: ["controllers/a.ts", "controllers/b.ts"] });
    expect(result.labels.size).toBe(0);
  });

  it("computes source roots per package over all source files (D-11)", () => {
    const result = rolesOf({
      files: [
        "packages/api/src/server.ts",
        "packages/api/src/handlers/orders.ts",
        "packages/web/src/components/Button.tsx",
        "packages/web/src/components/Card.tsx",
        { path: "packages/web/test/components/Button.test.tsx", role: "test" },
      ],
      packages: ["packages/api", "packages/web"],
    });
    expect(labelOf(result, "packages/api/src/handlers/orders.ts").location).toEqual({
      label: "handler",
      directory: "packages/api/src/handlers",
    });
    // The web package's source files all lie in `components`, so its source root is that directory.
    expect(result.labels.has(fileId("packages/web/src/components/Button.tsx"))).toBe(false);
    expect(entriesOf(result, "packages/api/src/handlers/orders.ts")).toEqual([]);
  });

  it("gives a container no vote, even when its stem is a layer key (D-07, D-08, D-18)", () => {
    const result = rolesOf({
      files: ["src/main.ts", "src/domains/orders/orders.ts", "src/domains/orders/controllers/x.ts"],
    });
    expect(result.labels.has(fileId("src/domains/orders/orders.ts"))).toBe(false);
    expect(labelOf(result, "src/domains/orders/controllers/x.ts").location).toEqual({
      label: "controller",
      directory: "src/domains/orders/controllers",
    });
  });

  it("writes a location role only for layers exactly one role maps to (D-18)", () => {
    const spec: SyntheticModelSpec = {
      files: ["src/main.ts", "src/domain/order.ts", "src/models/order.ts"],
    };
    const result = rolesOf(spec);
    // `domain` has no role: a layer vote only.
    expect(labelOf(result, "src/domain/order.ts").votes[0]?.role).toBeUndefined();
    expect(labelOf(result, "src/domain/order.ts").label).toBe("domain");
    expect(entriesOf(result, "src/domain/order.ts")).toEqual([]);
    expect(entriesOf(result, "src/models/order.ts")).toEqual(["data-model/location 0.7"]);
    // Two roles map to `model`: the location vote stays, the role goes.
    const ambiguous = rolesOf(spec, [], {
      layers: { role_layers: { "data-transfer-object": "model" } },
    });
    expect(labelOf(ambiguous, "src/models/order.ts").label).toBe("model");
    expect(entriesOf(ambiguous, "src/models/order.ts")).toEqual([]);
  });

  it("gives tests, declarations and other non-source files no roles and no labels (D-17)", () => {
    const tests = [
      { path: "src/controllers/order.controller.test.ts", role: "test" },
      { path: "src/controllers/globals.d.ts", role: "declaration" },
      { path: "src/controllers/routes.json", role: "data" },
    ] as const satisfies readonly SyntheticFileSpec[];
    const result = rolesOf(
      { files: ["src/main.ts", "src/controllers/order.controller.ts", ...tests] },
      [{ role: "http-controller", files: tests.map((file) => fileId(file.path)) }],
    );
    for (const file of tests) {
      expect(result.labels.has(fileId(file.path))).toBe(false);
      expect(result.roles.has(fileId(file.path))).toBe(false);
    }
    expect(result.labels.has(fileId("src/controllers/order.controller.ts"))).toBe(true);
  });

  it("never reads inference's own entries as votes (D-20)", () => {
    const result = rolesOf({
      files: [
        {
          path: "src/a.ts",
          roles: [
            detected("service", "nestjs", 0.9),
            detected("http-controller", "naming", 0.8),
            detected("repository", "location", 0.7),
            detected("utility", "configuration", 1),
          ],
        },
      ],
    });
    expect(votesOf(labelOf(result, "src/a.ts"))).toEqual(["service detector detector-role 0.9"]);
    expect(result.roles.has(fileId("src/a.ts"))).toBe(false);
  });
});

describe("inferRoles: labels (§4.3, D-14, D-19)", () => {
  it("counts correlated votes of one source once (D-14, clean-architecture's SQL repositories)", () => {
    const path = "src/infrastructure/persistence/sql-book-repository.ts";
    const result = rolesOf({
      files: ["src/main.ts", "src/domain/model/book.ts", { path, classes: ["SqlBookRepository"] }],
    });
    const label = labelOf(result, path);
    expect(votesOf(label)).toEqual([
      "repository naming name-suffix 0.6",
      "repository naming type-name-suffix 0.6",
      "infrastructure location directory-name 0.7",
    ]);
    // Literal noisy-OR would give repository 1 − 0.4 · 0.4 = 0.84 and take the file out of its layer.
    expect(label).toMatchObject({ label: "infrastructure", score: 0.7 });
    const [entry] = result.roles.get(fileId(path)) ?? [];
    expect(entry?.role).toBe("repository");
    expect(entry?.confidence).toBe(0.6);
    expect(entry?.evidence.map((evidence) => evidence.signal)).toEqual([
      "name-suffix",
      "type-name-suffix",
    ]);
  });

  it("combines sources by noisy-OR: a controller in `controllers/` scores 0.94", () => {
    const result = rolesOf({
      files: [
        "src/main.ts",
        "src/controllers/order.controller.ts",
        "src/controllers/user.service.ts",
      ],
    });
    expect(labelOf(result, "src/controllers/order.controller.ts")).toMatchObject({
      label: "controller",
      score: 0.94,
    });
    expect(entriesOf(result, "src/controllers/order.controller.ts")).toEqual([
      "http-controller/location 0.7",
      "http-controller/naming 0.8",
    ]);
    // A misplaced service is still a service (§4.3): naming 0.8 beats location 0.7.
    expect(labelOf(result, "src/controllers/user.service.ts")).toMatchObject({
      label: "service",
      score: 0.8,
    });
  });

  it("does not raise a score with a second vote of the same source (D-14: `UserService` stays 0.8)", () => {
    const result = rolesOf({
      files: ["src/main.ts", { path: "src/controllers/user.service.ts", classes: ["UserService"] }],
    });
    expect(labelOf(result, "src/controllers/user.service.ts")).toMatchObject({
      label: "service",
      score: 0.8,
    });
  });

  it("breaks exact ties by source precedence, then in favour of ⊥, then by name (D-19)", () => {
    const result = rolesOf(
      {
        files: [
          // naming ⊥ (module-definition) 0.6 against naming service 0.6: ⊥ wins.
          { path: "src/lib/payment-module.ts", classes: ["PaymentService"] },
          // naming service 0.6 against naming repository 0.6: the smaller name wins.
          { path: "src/lib/payment-service.ts", classes: ["PaymentRepository"] },
          // detector service 0.7 against location controller 0.7: the detector's precedence wins.
          { path: "src/controllers/a.ts", roles: [detected("service", "custom", 0.7)] },
          // configuration ⊥ against configuration service, both 1: ⊥ wins.
          "src/lib/both.ts",
        ],
      },
      [
        { role: "service", files: [fileId("src/lib/both.ts")] },
        { role: "configuration-provider", files: [fileId("src/lib/both.ts")] },
      ],
    );
    expect(labelOf(result, "src/lib/payment-module.ts")).toMatchObject({ label: null, score: 0.6 });
    expect(labelOf(result, "src/lib/payment-service.ts")).toMatchObject({
      label: "repository",
      score: 0.6,
    });
    expect(labelOf(result, "src/controllers/a.ts")).toMatchObject({ label: "service", score: 0.7 });
    expect(labelOf(result, "src/lib/both.ts")).toMatchObject({ label: null, score: 1 });
  });

  it("compares label scores after roundMetric, so equal products computed in another order tie (D-67)", () => {
    // Three detectors per label, multiplied in source order: (0.4 · 0.4) · 0.45 and (0.4 · 0.45) · 0.4
    // differ in the last bit; both are 0.928 after roundMetric.
    const roles = [
      detected("http-controller", "d1", 0.6),
      detected("http-controller", "d2", 0.6),
      detected("http-controller", "d3", 0.55),
      detected("service", "d1", 0.6),
      detected("service", "d2", 0.55),
      detected("service", "d3", 0.6),
    ];
    const raw = (a: number, b: number, c: number): number => 1 - (1 - a) * (1 - b) * (1 - c);
    expect(raw(0.6, 0.6, 0.55)).not.toBe(raw(0.6, 0.55, 0.6));
    expect(roundMetric(raw(0.6, 0.6, 0.55))).toBe(roundMetric(raw(0.6, 0.55, 0.6)));
    const result = rolesOf({ files: [{ path: "src/a.ts", roles }] });
    // A tie of the rounded scores with equal precedence goes to the smaller name.
    expect(labelOf(result, "src/a.ts")).toMatchObject({ label: "controller", score: 0.928 });
  });

  it("labels a file only when the winning score reaches min_label_score", () => {
    const spec: SyntheticModelSpec = { files: ["src/a/payment-service.ts"] };
    expect(labelOf(rolesOf(spec), "src/a/payment-service.ts")).toMatchObject({
      label: "service",
      score: 0.6,
    });
    const strict = rolesOf(spec, [], { layers: { min_label_score: 0.7 } });
    expect(labelOf(strict, "src/a/payment-service.ts")).toMatchObject({ label: null, score: 0.6 });
    // The role entry does not depend on the label threshold.
    expect(entriesOf(strict, "src/a/payment-service.ts")).toEqual(["service/naming 0.6"]);
  });

  it("orders votes by source precedence, then label (⊥ first), then signal", () => {
    const path = "src/controllers/payment-module.service.ts";
    const result = rolesOf(
      {
        files: [
          "src/main.ts",
          { path, classes: ["PaymentStore"], roles: [detected("utility", "custom", 0.5)] },
        ],
      },
      [{ role: "repository", files: [fileId(path)] }],
    );
    const label = labelOf(result, path);
    expect(votesOf(label)).toEqual([
      "repository configuration configured-glob 1",
      "⊥ detector detector-role 0.5",
      // The head `payment-module` ends with the word `module` (module-definition, no layer).
      "⊥ naming name-suffix 0.6",
      "service naming name-qualifier 0.8",
      "store naming type-name-suffix 0.6",
      "controller location directory-name 0.7",
    ]);
    expect(label).toMatchObject({ label: "repository", score: 1 });
    expect(entriesOf(result, path)).toEqual([
      "http-controller/location 0.7",
      "module-definition/naming 0.6",
      "repository/configuration 1",
      "service/naming 0.8",
      "state-store/naming 0.6",
    ]);
  });

  it("is idempotent: running on its own output gives the same roles and labels (D-20)", () => {
    const spec: SyntheticModelSpec = {
      files: [
        "src/main.ts",
        { path: "src/controllers/order.controller.ts", classes: ["OrderController"] },
        { path: "src/services/order.service.ts", roles: [detected("service", "nestjs", 0.9)] },
        "src/domain/order.ts",
        "src/lib/order-module.ts",
      ],
    };
    const configured = [{ role: "utility" as const, files: [fileId("src/lib/order-module.ts")] }];
    const model = syntheticModel(spec);
    const first = inferRoles({ model, settings: SETTINGS, configured });
    const merged = ArchitectureModel.from({
      ...model.document,
      files: withRoles(model.document.files, first.roles),
    });
    const second = inferRoles({ model: merged, settings: SETTINGS, configured });
    expect([...second.roles]).toEqual([...first.roles]);
    expect([...second.labels]).toEqual([...first.labels]);
    // The merged files carry the detector entry and the inferred ones.
    expect(
      merged.index
        .file(fileId("src/services/order.service.ts"))
        ?.roles?.map((entry) => entry.source),
    ).toEqual(["location", "naming", "nestjs"]);
  });

  it("does not depend on the order of the document's arrays (property)", () => {
    const model = prototypeModel("layered-architecture");
    const expected = inferRoles({ model, settings: SETTINGS, configured: [] });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 - 1 }), (seed) => {
        const shuffled = inferRoles({
          model: shuffledModel(model, seed),
          settings: SETTINGS,
          configured: [],
        });
        expect([...shuffled.roles]).toEqual([...expected.roles]);
        expect([...shuffled.labels]).toEqual([...expected.labels]);
      }),
      { seed: 20261008, numRuns: 20 },
    );
  });

  it("lists maps in file id order and every file with a vote", () => {
    const result = inferRoles({
      model: prototypeModel("layered-architecture"),
      settings: SETTINGS,
      configured: [],
    });
    const files = [...result.labels.keys()];
    expect(files).toEqual([...files].sort(compareStrings));
    expect([...result.roles.keys()]).toEqual([...result.roles.keys()].sort(compareStrings));
    // The design's layered example: 3 controllers at 0.94; `shared/*` and `main.ts` have no vote (§4.3).
    expect(
      files.filter((file) => result.labels.get(file)?.score === 0.94).map((file) => file.slice(5)),
    ).toEqual([
      "src/controllers/order.controller.ts",
      "src/controllers/payment.controller.ts",
      "src/controllers/user.controller.ts",
      "src/repositories/order.repository.ts",
      "src/repositories/payment.repository.ts",
      "src/repositories/user.repository.ts",
      "src/services/order.service.ts",
      "src/services/payment.service.ts",
      "src/services/user.service.ts",
    ]);
    expect(files.some((file) => file.startsWith("file:src/shared/"))).toBe(false);
    expect(files).not.toContain("file:src/main.ts");
  });
});

describe("inferRoles: role evidence (plan 4.6, D-66)", () => {
  it("names the rule and the vocabulary entry for every signal", () => {
    const path = "src/controllers/payment.controller.ts";
    const result = rolesOf(
      {
        files: [
          "src/main.ts",
          { path, classes: ["PaymentController"] },
          "src/services/payment-service.ts",
        ],
      },
      [{ role: "http-controller", files: [fileId(path)] }],
    );
    expect(result.roles.get(fileId(path))).toEqual([
      {
        role: "http-controller",
        confidence: 1,
        source: "configuration",
        evidence: [
          {
            signal: "configured-glob",
            description: "The file matches `inference.roles.http-controller`.",
            value: 1,
          },
        ],
      },
      {
        role: "http-controller",
        confidence: 0.7,
        source: "location",
        evidence: [
          {
            signal: "directory-name",
            description:
              "Location rule (Katedrala heuristic): the file lies in `src/controllers`, which the directory vocabulary maps to the layer `controller`.",
            value: 0.7,
            entities: ["dir:src/controllers"],
          },
        ],
      },
      {
        role: "http-controller",
        confidence: 0.8,
        source: "naming",
        evidence: [
          {
            signal: "name-qualifier",
            description:
              "Naming rule (Katedrala heuristic): the file name `payment.controller.ts` has the qualifier `controller`, which the naming vocabulary maps to `http-controller`.",
            value: 0.8,
            entities: [fileId(path)],
          },
          {
            signal: "type-name-suffix",
            description:
              "Naming rule (Katedrala heuristic): the exported class `PaymentController` ends with the word `controller`, which the naming vocabulary maps to `http-controller`.",
            value: 0.6,
            entities: [symbolId(path, "PaymentController")],
          },
        ],
      },
    ]);
    expect(result.roles.get(fileId("src/services/payment-service.ts"))).toEqual([
      {
        role: "service",
        confidence: 0.7,
        source: "location",
        evidence: [
          {
            signal: "directory-name",
            description:
              "Location rule (Katedrala heuristic): the file lies in `src/services`, which the directory vocabulary maps to the layer `service`.",
            value: 0.7,
            entities: ["dir:src/services"],
          },
        ],
      },
      {
        role: "service",
        confidence: 0.6,
        source: "naming",
        evidence: [
          {
            signal: "name-suffix",
            description:
              "Naming rule (Katedrala heuristic): the file name `payment-service.ts` ends with the word `service`, which the naming vocabulary maps to `service`.",
            value: 0.6,
            entities: ["file:src/services/payment-service.ts"],
          },
        ],
      },
    ]);
  });

  it("bounds evidence entities by limits.maxEvidenceEntities", () => {
    const result = rolesOf({
      files: ["src/main.ts", "src/controllers/order.controller.ts"],
      limits: { maxEvidenceEntities: 0 },
    });
    const evidence = (
      result.roles.get(fileId("src/controllers/order.controller.ts")) ?? []
    ).flatMap((entry) => entry.evidence);
    expect(evidence).toHaveLength(2);
    for (const entry of evidence) expect(entry.entities).toBeUndefined();
  });
});

describe("withRoles (D-20)", () => {
  const base = syntheticModel({
    files: [
      "src/a.ts",
      {
        path: "src/b.ts",
        roles: [detected("service", "nestjs", 0.9), detected("utility", "naming", 0.8)],
      },
      { path: "src/c.ts", roles: [detected("utility", "naming", 0.8)] },
      "src/d.ts",
    ],
  }).document.files;
  const fileAt = (files: readonly FileEntity[], path: string): FileEntity => {
    const file = files.find((entry) => entry.path === path);
    if (file === undefined) throw new Error(path);
    return file;
  };
  const naming = (role: ArchitecturalRole): RoleEntry => ({
    role,
    confidence: 0.8,
    source: "naming",
    evidence: [{ signal: "name-qualifier", description: "x", value: 0.8 }],
  });
  const roles = new Map<FileId, readonly RoleEntry[]>([
    [fileId("src/a.ts"), [naming("service")]],
    [fileId("src/b.ts"), [naming("http-controller")]],
  ]);
  const merged = withRoles(base, roles);

  it("adds inferred entries and keeps other sources, sorted by role then source", () => {
    expect(fileAt(merged, "src/a.ts").roles).toEqual([naming("service")]);
    expect(fileAt(merged, "src/b.ts").roles).toEqual([
      naming("http-controller"),
      detected("service", "nestjs", 0.9),
    ]);
  });

  it("replaces inference's own entries and omits `roles` when none remain", () => {
    expect(fileAt(merged, "src/c.ts").roles).toBeUndefined();
    expect("roles" in fileAt(merged, "src/c.ts")).toBe(false);
  });

  it("copies only the files that change and keeps the IR's key order", () => {
    expect(fileAt(merged, "src/d.ts")).toBe(fileAt(base, "src/d.ts"));
    expect(fileAt(merged, "src/a.ts")).not.toBe(fileAt(base, "src/a.ts"));
    expect(fileAt(base, "src/a.ts").roles).toBeUndefined();
    const keys = Object.keys(fileAt(merged, "src/a.ts"));
    expect(keys.slice(-2)).toEqual(["roles", "tags"]);
    // Merging the same entries again changes nothing.
    const again = withRoles(merged, roles);
    merged.forEach((file, index) => {
      expect(again[index]).toBe(file);
    });
  });
});
