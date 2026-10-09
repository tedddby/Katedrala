"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { VERSIONS, moduleEdgeList, type Version } from "@/lib/demo/history";
import { MODULE_FRAME, MODULE_MEMBERS } from "@/lib/demo/layout";
import { formatScore } from "@/lib/demo/metrics";
import { counted } from "@/lib/text";

const position = new Map(MODULE_MEMBERS.map((m) => [m.id, m]));

/** Joint radius in drawing units, and the support a foundation stands on. */
const JOINT = 13;
const SUPPORT = 20;
/** The ground line, under the foundations' supports. */
const GROUND = MODULE_FRAME.ground + SUPPORT;
/** The part of the module frame the small drawings show (its left margin and its empty top trimmed). */
const VIEW = { x: 40, y: 40, width: MODULE_FRAME.width - 40, height: GROUND + 16 - 40 };

/**
 * Architecture over time: the same system across five versions, laid out as a contact strip (one frame per
 * version, like the proofs of a film), each with what changed and what Katedrala flags in it.
 */
export function History() {
  const strip = useRef<HTMLOListElement>(null);
  // Below lg the versions form a strip that scrolls sideways, and only then does it take a Tab stop, so a keyboard
  // can scroll it; the five frames side by side on wide screens have nothing to scroll. Focusable until measured,
  // so the strip stays reachable without JavaScript.
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
      className="history-plate"
      title="See the structure drift across commits."
      lede="Compare two revisions or a range of history, and Katedrala will report new modules, new dependencies and new cycles."
      aside={<Status status="planned" />}
    >
      <div className="history-strip">
        <ol
          ref={strip}
          className="history"
          tabIndex={scrolls ? 0 : undefined}
          aria-label="Five versions of the demonstration system"
        >
          {VERSIONS.map((version) => (
            <li
              key={version.tag}
              className="history-frame"
              data-finding={version.finding !== undefined}
            >
              {/* Along the frame's top edge, as a contact sheet prints the frame number on the film's edge. */}
              <div className="history-edge-print">
                <span className="data text-ink">{version.tag}</span>
                <span className="data text-ink-faint">
                  entropy {formatScore(version.entropy.score)}
                </span>
              </div>
              <MiniDrawing version={version} />
              <p className="history-title">{version.title}</p>
              <p className="data history-change">{version.change}</p>
              {version.finding !== undefined && (
                <p className="history-finding">{version.finding}</p>
              )}
            </li>
          ))}
        </ol>
      </div>
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
  const id = useId();
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
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
      className="history-drawing"
      role="img"
      aria-label={describe(version, edges.length)}
    >
      <defs>
        <pattern
          id={`${id}-hatch`}
          width="13"
          height="13"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line x1="0" y1="0" x2="0" y2="13" className="history-hatch" />
        </pattern>
      </defs>
      {/* Every version stands on the same ground: the foundation module's support, hatched as in every load
          drawing on the page. */}
      <g aria-hidden="true">
        <line
          x1={VIEW.x + 24}
          x2={MODULE_FRAME.width - 16}
          y1={GROUND}
          y2={GROUND}
          className="history-ground"
        />
        <rect
          x={VIEW.x + 24}
          y={GROUND}
          width={MODULE_FRAME.width - 16 - VIEW.x - 24}
          height={14}
          fill={`url(#${id}-hatch)`}
        />
      </g>
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
          <g key={m.id} transform={`translate(${m.x} ${m.y})`}>
            {m.level === 0 && (
              <path
                d={`M 0 ${JOINT * 0.4} L -11 ${SUPPORT} L 11 ${SUPPORT} Z`}
                className="history-support"
              />
            )}
            <circle
              r={JOINT}
              className={cyclic.has(m.id) ? "history-joint is-cyclic" : "history-joint"}
            />
          </g>
        ) : (
          <circle key={m.id} cx={m.x} cy={m.y} r={JOINT} className="history-absent" />
        ),
      )}
    </svg>
  );
}
