import {
  MEASUREMENTS,
  MODULE_EDGES,
  MODULE_MEASUREMENTS,
  OTHER_MEMBERS,
  formatScore,
  measurementOf,
  moduleMeasurementOf,
} from "@/lib/demo/metrics";
import { MODULES, moduleName } from "@/lib/demo/system";
import { rests } from "@/lib/text";

/** The member that carries the most load, computed from the drawing: the hero's resting state tests it. */
export const HEAVIEST_MEMBER = [...MEASUREMENTS.values()].reduce((a, b) =>
  b.load > a.load ? b : a,
).node.id;

/** The module that carries the most load: the resting state of the module drawing. */
export const HEAVIEST_MODULE = [...MODULE_MEASUREMENTS.values()].reduce((a, b) =>
  b.load > a.load ? b : a,
).id;

/** Modules other than one module: the denominator of "how many rest on it". */
export const OTHER_MODULES = MODULES.length - 1;

/** Every module resting on a module, directly or through other modules. */
export function modulesRestingOn(id: string): string[] {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const target = stack.pop()!;
    for (const [source, to] of MODULE_EDGES) {
      if (to === target && !seen.has(source)) {
        seen.add(source);
        stack.push(source);
      }
    }
  }
  return [...seen];
}

interface MemberFacts {
  readonly name: string;
  readonly role: string;
  readonly module: string;
  readonly dependsOn: string;
  readonly dependedOnBy: string;
  readonly gravity: string;
  readonly resting: string;
}

function memberFacts(id: string): MemberFacts {
  const m = measurementOf(id);
  const n = m.transitiveDependents.length;
  return {
    name: m.node.id,
    role: m.node.role,
    module: moduleName(m.node.module),
    dependsOn: list(m.dependsOn, "nothing inside the system"),
    dependedOnBy: list(m.dependedOnBy, "nothing"),
    gravity: formatScore(m.gravity),
    resting: `${n} of ${OTHER_MEMBERS} ${rests(n)} on it`,
  };
}

/** The identity card of a tested member, set like a drawing's title block. */
export function MemberCard({ id }: { id: string }) {
  return <MemberCardView facts={memberFacts(id)} />;
}

function MemberCardView({ facts }: { facts: MemberFacts }) {
  return (
    <div className="member-card">
      <p className="data text-[0.875rem] text-ink">{facts.name}</p>
      <p className="mt-0.5 text-[0.8125rem] text-ink-faint">{facts.role}</p>
      <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem] [overflow-wrap:anywhere]">
        <dt className="text-ink-faint">Module</dt>
        <dd className="text-ink">{facts.module}</dd>
        <dt className="text-ink-faint">Depends on</dt>
        <dd className="text-ink">{facts.dependsOn}</dd>
        <dt className="text-ink-faint">Depended on by</dt>
        <dd className="text-ink">{facts.dependedOnBy}</dd>
        <dt className="text-ink-faint">Gravity</dt>
        <dd className="flex items-baseline gap-2">
          <span className="data text-[0.875rem] text-load">{facts.gravity}</span>
          <span className="text-ink-faint">{facts.resting}</span>
        </dd>
      </dl>
    </div>
  );
}

interface ModuleFacts {
  readonly name: string;
  readonly members: string;
  readonly dependsOn: string;
  readonly dependedOnBy: string;
  readonly carries: string;
}

function moduleFacts(id: string): ModuleFacts {
  const m = moduleMeasurementOf(id);
  return {
    name: m.name,
    members: m.members.join(", "),
    dependsOn: list(m.dependsOn.map(moduleName), "nothing inside the system"),
    dependedOnBy: list(m.dependedOnBy.map(moduleName), "nothing"),
    carries: shareOf(modulesRestingOn(m.id).length, OTHER_MODULES, "modules"),
  };
}

/** The card of a tested module in the module drawing small screens show. */
export function ModuleCard({ id }: { id: string }) {
  return <ModuleCardView facts={moduleFacts(id)} />;
}

function ModuleCardView({ facts }: { facts: ModuleFacts }) {
  return (
    <div className="member-card">
      <p className="text-[0.9375rem] font-semibold text-ink">{facts.name}</p>
      <dl className="mt-2.5 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem] [overflow-wrap:anywhere]">
        <dt className="text-ink-faint">Members</dt>
        <dd className="data text-ink">{facts.members}</dd>
        <dt className="text-ink-faint">Depends on</dt>
        <dd className="text-ink">{facts.dependsOn}</dd>
        <dt className="text-ink-faint">Depended on by</dt>
        <dd className="text-ink">{facts.dependedOnBy}</dd>
        <dt className="text-ink-faint">Carries</dt>
        <dd className="text-ink">{facts.carries}</dd>
      </dl>
    </div>
  );
}

/**
 * At rest: the member that carries the most, whose load path the drawing lights, and what bears on it directly.
 * The invitation to test another member sits at the card's foot.
 */
export function IdleCard() {
  const m = measurementOf(HEAVIEST_MEMBER);
  const n = m.transitiveDependents.length;
  return (
    <div className="member-card flex flex-col">
      <p className="data text-[0.875rem] text-ink">{HEAVIEST_MEMBER}</p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
        Carries the most load: {shareOf(n, OTHER_MEMBERS, "members")} {rests(n)} on it.
      </p>
      <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem] [overflow-wrap:anywhere]">
        <dt className="text-ink-faint">Module</dt>
        <dd className="text-ink">{moduleName(m.node.module)}</dd>
        <dt className="text-ink-faint">Depended on by</dt>
        <dd className="text-ink">{list(m.dependedOnBy, "nothing")}</dd>
      </dl>
      <RestingHint>Select any member to light the load path it carries.</RestingHint>
    </div>
  );
}

/** At rest in the module drawing: the module that carries the most, what it holds and what bears on it. */
export function ModuleIdleCard() {
  const m = moduleMeasurementOf(HEAVIEST_MODULE);
  const n = modulesRestingOn(HEAVIEST_MODULE).length;
  return (
    <div className="member-card flex flex-col">
      <p className="text-[0.9375rem] font-semibold text-ink">{m.name}</p>
      <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">
        Carries the most load: {shareOf(n, OTHER_MODULES, "modules")} {rests(n)} on it.
      </p>
      <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem] [overflow-wrap:anywhere]">
        <dt className="text-ink-faint">Members</dt>
        <dd className="data text-ink">{m.members.join(", ")}</dd>
        <dt className="text-ink-faint">Depended on by</dt>
        <dd className="text-ink">{list(m.dependedOnBy.map(moduleName), "nothing")}</dd>
      </dl>
      <RestingHint>Select any module to light the load path it carries.</RestingHint>
    </div>
  );
}

function RestingHint({ children }: { children: string }) {
  return <p className="mt-auto pt-3 text-[0.8125rem] leading-relaxed text-ink-faint">{children}</p>;
}

/** "13 of 15 members", or "all 7 other modules" when every other unit is counted. */
export function shareOf(n: number, others: number, units: string): string {
  return n === others ? `all ${others} other ${units}` : `${n} of ${others} ${units}`;
}

/**
 * Invisible stand-ins that reserve a card slot's height: each row holds the longest value any card shows, so
 * no card is taller at any width and the page never moves while members are tested.
 */
export function MemberCardSizer() {
  return <MemberCardView facts={longestOf([...MEASUREMENTS.keys()].map(memberFacts))} />;
}

export function ModuleCardSizer() {
  return <ModuleCardView facts={longestOf(MODULES.map((module) => moduleFacts(module.id)))} />;
}

function longestOf<T extends object>(all: readonly T[]): T {
  const longest = (key: keyof T) =>
    all.map((facts) => String(facts[key])).reduce((a, b) => (b.length > a.length ? b : a));
  return Object.fromEntries(Object.keys(all[0]!).map((key) => [key, longest(key as keyof T)])) as T;
}

function list(items: readonly string[], empty: string): string {
  return items.length === 0 ? empty : items.join(", ");
}
