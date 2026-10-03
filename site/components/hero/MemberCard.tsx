import { MEASUREMENTS, OTHER_MEMBERS, formatScore, measurementOf } from "@/lib/demo/metrics";
import { moduleName } from "@/lib/demo/system";
import { rests } from "@/lib/text";

/** The identity card of a tested member, set like a drawing's title block. */
export function MemberCard({ id }: { id: string }) {
  const m = measurementOf(id);
  return (
    <div className="member-card">
      <p className="data text-[0.875rem] text-ink">{m.node.id}</p>
      <p className="mt-0.5 text-[0.8125rem] text-ink-faint">{m.node.role}</p>
      <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <dt className="text-ink-faint">Module</dt>
        <dd className="text-ink">{moduleName(m.node.module)}</dd>
        <dt className="text-ink-faint">Depends on</dt>
        <dd className="text-ink">{list(m.dependsOn, "nothing inside the system")}</dd>
        <dt className="text-ink-faint">Depended on by</dt>
        <dd className="text-ink">{list(m.dependedOnBy, "nothing")}</dd>
        <dt className="text-ink-faint">Gravity</dt>
        <dd className="flex items-baseline gap-2">
          <span className="data text-[0.875rem] text-load">{formatScore(m.gravity)}</span>
          <span className="text-ink-faint">
            {m.transitiveDependents.length} of {OTHER_MEMBERS}{" "}
            {rests(m.transitiveDependents.length)} on it
          </span>
        </dd>
      </dl>
    </div>
  );
}

function list(items: readonly string[], empty: string): string {
  return items.length === 0 ? empty : items.join(", ");
}

/** Before any test: the member that carries the most, computed from the drawing. */
export function IdleCard() {
  const heaviest = [...MEASUREMENTS.values()].reduce((a, b) => (b.load > a.load ? b : a));
  return (
    <div className="member-card">
      <p className="text-[0.8125rem] text-ink-faint">Carries the most load</p>
      <p className="data mt-1 text-[0.875rem] text-ink">{heaviest.node.id}</p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
        {heaviest.transitiveDependents.length} of {OTHER_MEMBERS} members{" "}
        {rests(heaviest.transitiveDependents.length)} on it. Select any joint to test another member
        and light the load path it carries.
      </p>
    </div>
  );
}
