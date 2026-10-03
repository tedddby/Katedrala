import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { VERSIONS, moduleEdgeList, type Version } from "@/lib/demo/history";
import { MODULE_FRAME, MODULE_MEMBERS } from "@/lib/demo/layout";
import { formatScore } from "@/lib/demo/metrics";

const position = new Map(MODULE_MEMBERS.map((m) => [m.id, m]));

/** Architecture over time: the same system across five versions, with what changed and what Katedrala flags. */
export function History() {
  return (
    <Section
      id="history"
      title="See the structure drift across commits."
      lede="Compare two revisions or sample a range of history, and Katedrala reports what changed in the architecture: new modules, new dependencies, new cycles."
      aside={<Status status="planned" />}
    >
      <ol className="history" tabIndex={0} aria-label="Five versions of the demonstration system">
        {VERSIONS.map((version) => (
          <li
            key={version.tag}
            className="history-version"
            data-finding={version.finding !== undefined}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="data text-ink">{version.tag}</span>
              <span className="data text-ink-faint">
                entropy {formatScore(version.entropy.score)}
              </span>
            </div>
            <MiniDrawing version={version} />
            <p className="text-[0.9375rem] font-semibold text-ink">{version.title}</p>
            <p className="data mt-1 text-[0.75rem] text-ink-faint">{version.change}</p>
            {version.finding !== undefined && <p className="history-finding">{version.finding}</p>}
          </li>
        ))}
      </ol>
      <p className="mt-6 text-[0.8125rem] text-ink-faint">
        Demonstration system. Entropy uses the draft Katedrala heuristic, computed for each version.
      </p>
    </Section>
  );
}

function MiniDrawing({ version }: { version: Version }) {
  const present = new Set<string>(version.modules);
  // The cycle a new dependency closed: its modules and the edges along it.
  const cyclic = new Set<string>(version.cycle ?? []);
  const cycleEdges = new Set(
    (version.cycle ?? []).slice(1).map((m, i) => `${version.cycle![i]}>${m}`),
  );
  return (
    <svg
      viewBox={`40 40 ${MODULE_FRAME.width - 40} ${MODULE_FRAME.height - 20}`}
      className="my-4 block h-auto w-full"
      role="img"
      aria-label={`${version.tag}: ${version.modules.length} modules${version.finding !== undefined ? `. ${version.finding}` : ""}`}
    >
      {moduleEdgeList(version).map(([source, target]) => {
        const a = position.get(source)!;
        const b = position.get(target)!;
        const key = `${source}>${target}`;
        const state = cycleEdges.has(key)
          ? "cycle"
          : version.newModuleEdges.has(key)
            ? "new"
            : "old";
        return (
          <line
            key={key}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            className={`history-edge history-edge-${state}${state === "cycle" && version.newModuleEdges.has(key) ? " is-new" : ""}`}
          />
        );
      })}
      {MODULE_MEMBERS.map((m) =>
        present.has(m.id) ? (
          <circle
            key={m.id}
            cx={m.x}
            cy={m.y}
            r={13}
            className={cyclic.has(m.id) ? "entropy-joint is-cyclic" : "entropy-joint"}
          />
        ) : (
          <circle key={m.id} cx={m.x} cy={m.y} r={13} className="history-absent" />
        ),
      )}
    </svg>
  );
}
