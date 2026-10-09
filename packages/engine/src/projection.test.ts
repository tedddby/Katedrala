import {
  DEFAULT_EDGE_KINDS,
  DEFAULT_FILE_ROLES,
  fromProjectionInfo,
  toProjectionInfo,
} from "@katedrala/model";
import { describe, expect, it } from "vitest";
import { metricsProjectionOptions } from "./projection.js";

describe("metricsProjectionOptions (plan 3.4)", () => {
  it("projects production code and declarations over the default edge kinds", () => {
    const options = metricsProjectionOptions({
      includeTypeOnly: true,
      includeTestsInMetrics: false,
    });
    expect([...(options.edgeKinds ?? [])]).toEqual([...DEFAULT_EDGE_KINDS]);
    expect([...(options.fileRoles ?? [])]).toEqual([...DEFAULT_FILE_ROLES]);
    expect(options.includeTypeOnly).toBe(true);
    expect("includeExternals" in options).toBe(false);
  });

  it("adds tests with analysis.include_tests_in_metrics and follows analysis.include_type_only", () => {
    const options = metricsProjectionOptions({
      includeTypeOnly: false,
      includeTestsInMetrics: true,
    });
    expect([...(options.fileRoles ?? [])]).toEqual(["declaration", "source", "test"]);
    expect(options.includeTypeOnly).toBe(false);
  });

  it("is described by toProjectionInfo, and fromProjectionInfo gives the options back", () => {
    const options = metricsProjectionOptions({
      includeTypeOnly: true,
      includeTestsInMetrics: true,
    });
    const info = toProjectionInfo(options);
    expect(info).toEqual({
      edgeKinds: [...DEFAULT_EDGE_KINDS],
      includeTypeOnly: true,
      fileRoles: ["declaration", "source", "test"],
    });
    expect(fromProjectionInfo(info)).toEqual(options);
  });

  it("returns fresh sets on every call", () => {
    const settings = { includeTypeOnly: true, includeTestsInMetrics: false };
    const first = metricsProjectionOptions(settings);
    const second = metricsProjectionOptions(settings);
    expect(first.edgeKinds).not.toBe(second.edgeKinds);
    expect(first.fileRoles).not.toBe(second.fileRoles);
    expect(first).toEqual(second);
  });
});
