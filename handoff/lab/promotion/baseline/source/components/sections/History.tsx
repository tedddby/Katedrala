"use client";

import { useEffect, useRef, useState } from "react";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { VERSIONS, moduleEdgeList, type Version } from "@/lib/demo/history";
import { MODULE_FRAME, MODULE_MEMBERS } from "@/lib/demo/layout";
import { formatScore } from "@/lib/demo/metrics";
import { counted } from "@/lib/text";

const position = new Map(MODULE_MEMBERS.map((m) => [m.id, m]));

/** Architecture over time: the same system across five versions, with what changed and what Katedrala flags. */
export function History() {
  const strip = useRef<HTMLOListElement>(null);
  // Below lg the versions form a strip that scrolls sideways, and only then does it take a Tab stop, so a keyboard
  // can scroll it; the five-column row on wide screens has nothing to scroll. Focusable until measured, so the
  // strip stays reachable without JavaScript.
  const [scrolls, setScrolls] = useState(true);
  useEffect(() => {
    const list = strip.current;
    if (list === null) return;
    const update = () => setScrolls(list.scrollWidth - list.clientWidth > 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return (
    <Section
      id="history"
      title="See the structure drift across commits."
      lede="Compare two revisions or a range of history, and Katedrala will report new modules, new dependencies and new cycles."
      aside={<Status status="planned" />}
    >
      <ol
        ref={strip}
        className="history"
        tabIndex={scrolls ? 0 : undefined}
        aria-label="Five versions of the demonstration system"
      >
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
      <p className="footnote">
        Demonstration system. Entropy uses the draft Katedrala heuristic, computed for each version.
      </p>
    </Section>
  );
}

/** A version's text alternative: what the drawing shows, then what Katedrala flags in it. */
function describe(version: Version, dependencies: number): string {
  const fresh = version.newModuleEdges.size;
  const all = version.modules.length === MODULE_MEMBERS.length;
  const parts = [
    `${version.tag}: ${all ? "all" : `${version.modules.length} of`} ${MODULE_MEMBERS.length} modules`,
    `${counted(dependencies, "dependency", "dependencies")} between them`,
    ...(fresh > 0 ? [`${fresh} new`] : []),
  ];
  return `${parts.join(", ")}.${version.finding === undefined ? "" : ` ${version.finding}`}`;
}

function MiniDrawing({ version }: { version: Version }) {
  const present = new Set<string>(version.modules);
  const edges = moduleEdgeList(version);
  // What the version's finding is about, lit in load blue: the cycle a new dependency closed (its modules and
  // the edges along it), or the new dependency that runs up the load path.
  const cyclic = new Set<string>(version.cycle ?? []);
  const flagged = new Set(
    version.cycle !== undefined
      ? version.cycle.slice(1).map((m, i) => `${version.cycle![i]}>${m}`)
      : version.upward !== undefined
        ? [`${version.upward[0]}>${version.upward[1]}`]
        : [],
  );
  return (
    <svg
      viewBox={`40 40 ${MODULE_FRAME.width - 40} ${MODULE_FRAME.height - 20}`}
      className="my-4 block h-auto w-full"
      role="img"
      aria-label={describe(version, edges.length)}
    >
      {edges.map(([source, target]) => {
        const a = position.get(source)!;
        const b = position.get(target)!;
        const key = `${source}>${target}`;
        const state = flagged.has(key)
          ? "flagged"
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
            className={`history-edge history-edge-${state}${state === "flagged" && version.newModuleEdges.has(key) ? " is-new" : ""}`}
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
