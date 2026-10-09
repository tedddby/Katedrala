import { ARCHITECTURAL_ROLES, compareStrings } from "@katedrala/ir";
import { describe, expect, it } from "vitest";
import { normalizeVocabularyName } from "./settings.js";
import {
  DEFAULT_CONTAINER_DIRECTORIES,
  DEFAULT_CONVENTIONAL_TIERS,
  DEFAULT_DIRECTORY_LAYERS,
  DEFAULT_GENERIC_TOKENS,
  DEFAULT_NAMING_SUFFIXES,
  DEFAULT_ROLE_LAYERS,
  DEFAULT_SHARED_DIRECTORIES,
} from "./vocabulary.js";

const LISTS = [
  ["containers", DEFAULT_CONTAINER_DIRECTORIES],
  ["shared", DEFAULT_SHARED_DIRECTORIES],
  ["generic", DEFAULT_GENERIC_TOKENS],
] as const;
const MAPS = [
  ["directory-layers", DEFAULT_DIRECTORY_LAYERS],
  ["naming-suffixes", DEFAULT_NAMING_SUFFIXES],
] as const;
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const isSorted = (values: readonly string[]): boolean =>
  values.every((value, index) => index === 0 || compareStrings(values[index - 1]!, value) < 0);

/** A space-separated list of plan 4.1.3, sorted. */
const words = (list: string): string[] => list.split(" ").sort(compareStrings);

/** A map of plan 4.1.3, transcribed as `keys→value` groups separated by "; ". */
function groups(table: string): Record<string, string> {
  const record: Record<string, string> = {};
  for (const group of table.split("; ")) {
    const [keys = "", value = ""] = group.split("→");
    for (const key of keys.split(" ")) record[key] = value;
  }
  return record;
}

describe("default vocabularies (plan 4.1.3)", () => {
  it("are frozen and sorted, so they serialize canonically", () => {
    for (const [, list] of LISTS) {
      expect(Object.isFrozen(list)).toBe(true);
      expect(isSorted(list)).toBe(true);
    }
    for (const record of [DEFAULT_DIRECTORY_LAYERS, DEFAULT_NAMING_SUFFIXES, DEFAULT_ROLE_LAYERS]) {
      expect(Object.isFrozen(record)).toBe(true);
      expect(isSorted(Object.keys(record))).toBe(true);
    }
    expect(Object.isFrozen(DEFAULT_CONVENTIONAL_TIERS)).toBe(true);
    for (const tier of DEFAULT_CONVENTIONAL_TIERS) {
      expect(Object.isFrozen(tier)).toBe(true);
      expect(isSorted(tier)).toBe(true);
    }
  });

  it("are written in normalized form (D-69)", () => {
    for (const [list, entries] of LISTS) {
      for (const entry of entries) expect(normalizeVocabularyName(list, entry)).toBe(entry);
    }
    for (const [list, record] of MAPS) {
      for (const key of Object.keys(record)) expect(normalizeVocabularyName(list, key)).toBe(key);
    }
  });

  it("match the plan's tables exactly (plan 4.1.3)", () => {
    expect(DEFAULT_CONTAINER_DIRECTORIES).toEqual(
      words(
        "app apps cmd domains feature features internal libs module modules packages pkg source sources src",
      ),
    );
    expect(DEFAULT_SHARED_DIRECTORIES).toEqual(
      words(
        "base common config configuration constant core helper interface kernel lib misc setting shared " +
          "support tool type util utility",
      ),
    );
    expect(DEFAULT_GENERIC_TOKENS).toEqual(
      words(
        "abstract action adapter app base bootstrap client command common component config constant " +
          "consumer container context controller core default dto effect entity enum error event exception " +
          "factory filter fixture guard handler helper hook index init interceptor interface job listener " +
          "log logger main mapper message middleware mock mod model module option page pipe provider query " +
          "reducer repo repository request resolver response result route router saga schema selector " +
          "server service setting setup shared slice spec store story style subscriber test type util " +
          "validator view worker",
      ),
    );
    expect(DEFAULT_DIRECTORY_LAYERS).toEqual(
      groups(
        "controller→controller; route router routing→route; handler→handler; resolver→resolver; " +
          "middleware guard interceptor→middleware; view→view; page screen→page; component→component; " +
          "presentation ui web http→presentation; api rest graphql endpoint→api; service→service; " +
          "usecase use-case use_case interactor application→application; domain→domain; " +
          "model entity→model; schema→schema; dto→dto; repository repo dao persistence→repository; " +
          "db database→database; data→data; storage→storage; store→store; client→client; " +
          "gateway→gateway; integration→integration; adapter→adapter; port→port; " +
          "infrastructure infra→infrastructure; job worker task cron→job; hook→hook; " +
          "listener subscriber consumer→listener; command cli→command",
      ),
    );
    expect(DEFAULT_NAMING_SUFFIXES).toEqual(
      groups(
        "controller→http-controller; route router→route-definition; " +
          "middleware guard interceptor→middleware; service→service; repository repo→repository; " +
          "entity model→data-model; dto→data-transfer-object; client→external-client; " +
          "module→module-definition; store→state-store; page→ui-page; component→ui-component",
      ),
    );
    expect(DEFAULT_ROLE_LAYERS).toEqual({
      ...groups(
        "http-controller→controller; route-definition→route; middleware→middleware; service→service; " +
          "repository→repository; data-model→model; data-transfer-object→dto; external-client→client; " +
          "ui-page→page; ui-component→component; state-store→store",
      ),
      "module-definition": null,
      "configuration-provider": null,
      utility: null,
    });
    expect(DEFAULT_SHARED_DIRECTORIES).toHaveLength(18);
    expect(DEFAULT_GENERIC_TOKENS).toHaveLength(82);
    expect(Object.keys(DEFAULT_DIRECTORY_LAYERS)).toHaveLength(58);
    expect(new Set(Object.values(DEFAULT_DIRECTORY_LAYERS)).size).toBe(31);
  });

  it("include the additions of D-10", () => {
    expect(DEFAULT_SHARED_DIRECTORIES).toContain("utility");
    expect(DEFAULT_DIRECTORY_LAYERS).toMatchObject({
      use_case: "application",
      consumer: "listener",
      cli: "command",
    });
    for (const token of ["mapper", "factory", "saga", "reducer", "selector"]) {
      expect(DEFAULT_GENERIC_TOKENS).toContain(token);
    }
  });

  it("match containers exactly, so that containers never capture layers or shared names (D-07)", () => {
    expect(DEFAULT_CONTAINER_DIRECTORIES).toContain("domains");
    expect(DEFAULT_CONTAINER_DIRECTORIES).not.toContain("domain");
    expect(DEFAULT_DIRECTORY_LAYERS.domain).toBe("domain");
    expect(DEFAULT_CONTAINER_DIRECTORIES).toContain("libs");
    expect(DEFAULT_SHARED_DIRECTORIES).toContain("lib");
    expect(DEFAULT_SHARED_DIRECTORIES).not.toContain("libs");
  });

  it("map every known role to a layer or to none", () => {
    expect(Object.keys(DEFAULT_ROLE_LAYERS).sort(compareStrings)).toEqual(
      [...ARCHITECTURAL_ROLES].sort(compareStrings),
    );
    expect(
      Object.entries(DEFAULT_ROLE_LAYERS)
        .filter(([, layer]) => layer === null)
        .map(([role]) => role),
    ).toEqual(["configuration-provider", "module-definition", "utility"]);
    for (const role of Object.values(DEFAULT_NAMING_SUFFIXES)) {
      expect(ARCHITECTURAL_ROLES).toContain(role);
    }
  });

  it("use one set of kebab-case layer names", () => {
    const layers = new Set(Object.values(DEFAULT_DIRECTORY_LAYERS));
    for (const layer of layers) expect(layer).toMatch(KEBAB);
    for (const layer of Object.values(DEFAULT_ROLE_LAYERS)) {
      if (layer !== null) expect(layers.has(layer)).toBe(true);
    }
    const tiered = DEFAULT_CONVENTIONAL_TIERS.flat();
    expect(new Set(tiered).size).toBe(tiered.length);
    for (const layer of tiered) expect(layers.has(layer)).toBe(true);
    expect([...layers].filter((layer) => !tiered.includes(layer)).sort(compareStrings)).toEqual([
      "adapter",
      "infrastructure",
      "integration",
      "port",
    ]);
  });

  it("order the conventional tiers as the plan's table", () => {
    expect(DEFAULT_CONVENTIONAL_TIERS.map((tier) => tier.join(" "))).toEqual([
      "page route",
      "api command controller handler job listener middleware presentation resolver view",
      "application component hook service store",
      "client domain gateway repository",
      "data database dto model schema storage",
    ]);
  });

  it("list every naming-suffix key among the generic tokens", () => {
    // By default the role tokens of D-09 are generic tokens too, so non-stem tokens equal generic tokens
    // until a configuration adds a naming suffix.
    for (const key of Object.keys(DEFAULT_NAMING_SUFFIXES))
      expect(DEFAULT_GENERIC_TOKENS).toContain(key);
  });
});
