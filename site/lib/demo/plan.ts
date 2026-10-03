/**
 * Plan view of the demonstration system for the architecture explorer: every module is a bay (its boundary),
 * bays sit in rows by their module load level, and members sit inside their bay ordered by their own level. With
 * this arrangement every dependency points down a row or stays inside its bay.
 */
import { MODULE_EDGES, measurementOf, moduleMeasurementOf } from "./metrics";
import { EDGES, MODULES, NODES, type DemoEdgeKind, type ModuleId } from "./system";

export const PLAN = {
  width: 1000,
  rowHeight: 118,
  bayHeight: 70,
  memberGap: 168,
  bayPadding: 34,
  bayGap: 48,
} as const;

export interface Bay {
  readonly id: ModuleId;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly members: readonly string[];
}

export interface PlanMember {
  readonly id: string;
  readonly module: ModuleId;
  readonly x: number;
  readonly y: number;
}

const levels = [...new Set(MODULES.map((m) => moduleMeasurementOf(m.id).level))].sort(
  (a, b) => b - a,
);

const bays: Bay[] = [];
const members: PlanMember[] = [];

levels.forEach((level, row) => {
  const inRow = MODULES.filter((m) => moduleMeasurementOf(m.id).level === level);
  const widths = inRow.map((m) => {
    const count = NODES.filter((n) => n.module === m.id).length;
    return PLAN.bayPadding * 2 + (count - 1) * PLAN.memberGap + 60;
  });
  const total = widths.reduce((a, b) => a + b, 0) + PLAN.bayGap * (inRow.length - 1);
  let x = (PLAN.width - total) / 2;
  const y = 24 + row * PLAN.rowHeight;
  inRow.forEach((module, i) => {
    const ordered = NODES.filter((n) => n.module === module.id)
      .map((n) => n.id)
      .sort(
        (a, b) => measurementOf(b).level - measurementOf(a).level || (a < b ? -1 : a > b ? 1 : 0),
      );
    const width = widths[i]!;
    bays.push({
      id: module.id,
      name: module.name,
      x,
      y,
      width,
      height: PLAN.bayHeight,
      members: ordered,
    });
    ordered.forEach((id, j) => {
      members.push({
        id,
        module: module.id,
        x: x + PLAN.bayPadding + 30 + j * PLAN.memberGap,
        y: y + PLAN.bayHeight / 2 + 6,
      });
    });
    x += width + PLAN.bayGap;
  });
});

export const PLAN_HEIGHT = 24 + levels.length * PLAN.rowHeight;
export const BAYS: readonly Bay[] = bays;
export const PLAN_MEMBERS: readonly PlanMember[] = members;

export interface PlanEdge {
  readonly source: string;
  readonly target: string;
  readonly kind: DemoEdgeKind;
  /** Whether the dependency crosses a module boundary. */
  readonly crossing: boolean;
}

const moduleOf = new Map(NODES.map((n) => [n.id, n.module]));
export const PLAN_EDGES: readonly PlanEdge[] = EDGES.map((e) => ({
  source: e.source,
  target: e.target,
  kind: e.kind,
  crossing: moduleOf.get(e.source) !== moduleOf.get(e.target),
}));

export interface PlanModuleEdge {
  readonly source: ModuleId;
  readonly target: ModuleId;
  /** Member dependencies the module dependency aggregates. */
  readonly count: number;
}

export const PLAN_MODULE_EDGES: readonly PlanModuleEdge[] = MODULE_EDGES.map(
  ([source, target]) => ({
    source,
    target,
    count: EDGES.filter(
      (e) => moduleOf.get(e.source) === source && moduleOf.get(e.target) === target,
    ).length,
  }),
);

export const EDGE_KINDS: readonly { kind: DemoEdgeKind; label: string }[] = [
  { kind: "calls", label: "calls" },
  { kind: "instantiates", label: "instantiates" },
  { kind: "accesses-data", label: "accesses data" },
];
