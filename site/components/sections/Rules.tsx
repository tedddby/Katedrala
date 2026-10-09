"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { ChainPath, fromKeyboard, type ChainMotion } from "@/components/drawing/chain-motion";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";
import { impactOf, pathFrom } from "@/lib/demo/impact";
import {
  EDGES,
  NODES,
  RULE_CHANGE,
  RULE_CONFIG,
  checkRules,
  type RuleConfig,
} from "@/lib/demo/system";
import { counted, listed } from "@/lib/text";

/** The configuration as katedrala.config.yaml spells it, in the syntax of Katedrala's rule fixtures. */
function toYaml(config: RuleConfig): string {
  const quoted = (values: readonly string[]) => `[${values.map((v) => `"${v}"`).join(", ")}]`;
  const entries = (record: Readonly<Record<string, readonly string[]>>) =>
    Object.entries(record)
      .map(([name, globs]) => `  ${name}: ${quoted(globs)}`)
      .join("\n");
  const rules = config.rules
    .map((rule) =>
      [
        `  - id: ${rule.id}`,
        `    severity: ${rule.severity}`,
        rule.from !== undefined ? `    from: ${rule.from}` : `    module: ${rule.module}`,
        `    cannot_depend_on: [${rule.cannotDependOn.join(", ")}]`,
      ].join("\n"),
    )
    .join("\n\n");
  return `groups:\n${entries(config.groups)}\n\nmodules:\n${entries(config.modules)}\n\nrules:\n${rules}`;
}

const YAML = toYaml(RULE_CONFIG);
/** Line ids of the configuration, so the report can point at a rule's lines. */
const CONFIG_LINES = "rules-config";

// The check, computed: the demonstration system with one hypothetical import added, against the rules above,
// and the system as it is.
const VIOLATIONS = checkRules([...EDGES, RULE_CHANGE]);
const CLEAN = checkRules(EDGES);
const VIOLATION = VIOLATIONS[0]!;
const RULE = VIOLATION.rule;
const RULE_TEXT = `${capitalized(RULE.from ?? RULE.module ?? "")} cannot depend on ${listed(RULE.cannotDependOn)}.`;
/** The lines of the configuration that state the broken rule: from its id to the line before the next blank. */
const RULE_LINES = (() => {
  const lines = YAML.split("\n");
  const first = lines.findIndex((line) => line.trim() === `- id: ${RULE.id}`);
  let last = first;
  while (last + 1 < lines.length && lines[last + 1]!.trim() !== "") last += 1;
  return { from: first + 1, to: last + 1 };
})();
/** The route the system already has between the same two members, and whether the rules allow it. */
const ROUTE = pathFrom(VIOLATION.source, impactOf(VIOLATION.target));
const VIA = ROUTE.slice(1, -1);
const ROUTE_ALLOWED = CLEAN.every(
  (v) => !ROUTE.some((member, i) => member === v.source && ROUTE[i + 1] === v.target),
);
const MIDDLE = VIA[0] ?? VIOLATION.source;
/** The drawing's three bays: the constrained group, the layer the route passes through, the forbidden group. */
const BAYS = [
  { label: RULE.from ?? RULE.module ?? "", member: VIOLATION.source },
  { label: `${NODES.find((node) => node.id === MIDDLE)?.role ?? "member"}s`, member: MIDDLE },
  { label: RULE.cannotDependOn[0] ?? "", member: VIOLATION.target },
] as const;
const PROHIBITED = `prohibited: ${BAYS[0].label} → ${BAYS[2].label}`;
const ROUTE_TEXT = `${VIOLATION.source} reaches ${VIOLATION.target} through ${listed(VIA)}${ROUTE_ALLOWED ? ", which is allowed" : ""}`;
const DESCRIPTION = {
  added: `Hypothetical change to the demonstration system: ${ROUTE_TEXT}; a new direct import from ${VIOLATION.source} to ${VIOLATION.target} breaks the rule ${RULE.id}. ${RULE_TEXT}`,
  removed: `The demonstration system without the hypothetical import: ${ROUTE_TEXT}; ${
    CLEAN.length === 0 ? "no rule is broken" : `${counted(CLEAN.length, "rule")} broken`
  }.`,
};

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Architectural rules: intent written in configuration, checked on every change. */
export function Rules() {
  // The hypothetical import starts added, so the violation shows without interaction and without JavaScript.
  const [added, setAdded] = useState(true);
  const [motion, setMotion] = useState<ChainMotion>("animate");
  const errors = added ? VIOLATIONS.length : CLEAN.length;

  return (
    <Section
      id="rules"
      title="Write down the architecture you intend."
      lede="Rules in katedrala.config.yaml will check every change for forbidden dependencies, layering, isolation, cycles and fan-out."
      aside={<Status status="planned" />}
    >
      {/* The configuration and the check joined by a leader: from the broken rule's lines, across the gutter,
          to the break in the import that breaks it. */}
      <div className="rules-layout grid-12 relative gap-y-8" data-motion={motion}>
        <div className="col-span-12 min-w-0 lg:col-span-5">
          <CodeBlock
            label="katedrala.config.yaml"
            language="yaml"
            code={YAML}
            className="h-full"
            lineNumbers
            lineId={CONFIG_LINES}
            highlight={added ? RULE_LINES : undefined}
          />
        </div>
        <div className="col-span-12 flex min-w-0 lg:col-span-6 lg:col-start-7">
          <figure className="violation min-w-0 flex-1" data-added={added}>
            <div className="violation-header">
              <span>hypothetical change</span>
              <span className={added ? "text-ink-soft" : "text-ink-faint"}>
                + {VIOLATION.source} → {VIOLATION.target}
              </span>
            </div>
            <div className="violation-controls">
              <button
                type="button"
                className="rules-toggle"
                onClick={(event) => {
                  setMotion(fromKeyboard(event) ? "instant" : "animate");
                  setAdded((value) => !value);
                }}
              >
                {added ? "Remove the hypothetical import" : "Add the hypothetical import"}
              </button>
            </div>
            <div
              className="violation-body"
              role="img"
              aria-label={added ? DESCRIPTION.added : DESCRIPTION.removed}
            >
              <LandscapeDrawing added={added} motion={motion} />
              <PortraitDrawing added={added} motion={motion} />
            </div>
            <figcaption className="violation-report">
              {added ? (
                <>
                  <p className="data text-load">
                    {RULE.severity}&nbsp;&nbsp;
                    {/* Phones have no leader: the rule's name points at its lines instead. */}
                    <a
                      href={`#${CONFIG_LINES}-${RULE_LINES.from}`}
                      className="rules-rule-link lg:hidden"
                      aria-label={`${RULE.id}, lines ${RULE_LINES.from} to ${RULE_LINES.to} of katedrala.config.yaml`}
                    >
                      {RULE.id}
                    </a>
                    <span className="hidden lg:inline">{RULE.id}</span>
                  </p>
                  <p className="mt-2 text-[0.9375rem] text-ink">
                    {VIOLATION.source} now depends on {VIOLATION.target}.
                  </p>
                  <p className="mt-1 text-[0.875rem] text-ink-soft">
                    {RULE_TEXT}
                    {ROUTE_ALLOWED && (
                      <> The path through {listed(VIA)} is allowed; the new import skips it.</>
                    )}
                  </p>
                  <p className="data mt-3 break-all text-ink-faint">{VIOLATION.file}</p>
                </>
              ) : (
                <p className="text-[0.9375rem] text-ink">{ROUTE_TEXT}.</p>
              )}
              {/* The verdict is the report's one live line: short, and read whole when the import changes. */}
              <p role="status" className="data mt-1 text-ink-faint">
                {counted(errors, "error")}, {counted(RULE_CONFIG.rules.length, "rule")} checked
              </p>
            </figcaption>
          </figure>
        </div>
        <Leader on={added} />
      </div>
      <p className="footnote">
        Demonstration system, with one hypothetical import added. The configuration syntax is the
        one Katedrala's rule fixtures use today; the report layout is a preview.
      </p>
    </Section>
  );
}

/**
 * The leader from the broken rule to the break: a bracket beside the rule's lines in the gutter, a run across to
 * the middle of the gutter column, down or up to just under the violating import, then in to its break mark,
 * ending on a dot. Drawn only while the configuration and the drawing stand side by side, and measured again
 * whenever the layout or the type changes size.
 */
function Leader({ on }: { on: boolean }) {
  const svg = useRef<SVGSVGElement>(null);
  const [geometry, setGeometry] = useState<{ d: string; dot: { x: number; y: number } } | null>(
    null,
  );

  useLayoutEffect(() => {
    // The layout the leader is drawn over is its own container.
    const root = svg.current?.parentElement;
    if (root === null || root === undefined) return;
    const measure = () => {
      const box = root.getBoundingClientRect();
      const code = root.querySelector(".code-block")?.getBoundingClientRect();
      const panel = root.querySelector(".violation")?.getBoundingClientRect();
      const first = root
        .querySelector(`#${CONFIG_LINES}-${RULE_LINES.from}`)
        ?.getBoundingClientRect();
      const last = root.querySelector(`#${CONFIG_LINES}-${RULE_LINES.to}`)?.getBoundingClientRect();
      const mark = root.querySelector(".violation-landscape .rules-break")?.getBoundingClientRect();
      // Only where the two stand side by side, with a column of gutter between them.
      if (
        code === undefined ||
        panel === undefined ||
        first === undefined ||
        last === undefined ||
        mark === undefined ||
        mark.width === 0 ||
        panel.left - code.right < 24
      ) {
        setGeometry(null);
        return;
      }
      const x = (v: number) => v - box.left;
      const y = (v: number) => v - box.top;
      const f = (v: number) => v.toFixed(1);
      const bracket = x(code.right) + 8;
      const top = y(first.top) + 3;
      const bottom = y(last.bottom) - 3;
      const middle = (top + bottom) / 2;
      const gutter = (x(code.right) + x(panel.left)) / 2;
      const target = { x: x(mark.left), y: y(mark.bottom) };
      // The run in to the mark passes under the import, then rises to the mark's foot at 45 degrees. Where that
      // height falls beside the rule's lines (or near enough), the run leaves the bracket straight; otherwise it
      // steps in the middle of the gutter column.
      const wanted = target.y + 14;
      const level = Math.min(bottom, Math.max(top, wanted));
      const straight = Math.abs(level - wanted) <= 8;
      const run = straight ? level : wanted;
      const into = `H${f(target.x - (run - target.y))}L${f(target.x)} ${f(target.y)}`;
      setGeometry({
        d:
          `M${f(bracket - 5)} ${f(top)}H${f(bracket)}V${f(bottom)}H${f(bracket - 5)}` +
          (straight
            ? `M${f(bracket)} ${f(run)}${into}`
            : `M${f(bracket)} ${f(middle)}H${f(gutter)}V${f(run)}${into}`),
        dot: target,
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, []);

  return (
    <svg ref={svg} className="rules-leader" aria-hidden="true" data-on={on ? "" : undefined}>
      {geometry !== null && (
        <>
          <path d={geometry.d} pathLength={1} />
          <circle cx={geometry.dot.x} cy={geometry.dot.y} r={2.5} />
        </>
      )}
    </svg>
  );
}

/** Arrowheads for the allowed path and for the violating import; `suffix` keeps each drawing's ids its own. */
function Arrows({ suffix }: { suffix: string }) {
  return (
    <defs>
      {[
        { id: `rules-arrow${suffix}`, className: "plan-arrow" },
        { id: `rules-arrow-violation${suffix}`, className: "plan-arrow-dependency" },
      ].map((marker) => (
        <marker
          key={marker.id}
          id={marker.id}
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0.5 1 7 4 0.5 7" fill="none" strokeWidth="1.2" className={marker.className} />
        </marker>
      ))}
    </defs>
  );
}

interface DrawingProps {
  readonly added: boolean;
  readonly motion: ChainMotion;
}

/**
 * From small tablets up: the three bays side by side, the allowed path along them and the new import arcing
 * under the service bay, broken at its lowest point. Its type steps up where the drawing renders small
 * (rules-evidence.css).
 */
function LandscapeDrawing({ added, motion }: DrawingProps) {
  return (
    <svg
      viewBox="0 0 620 244"
      className="violation-landscape mx-auto hidden h-auto w-full sm:block sm:max-w-[40rem] lg:max-w-none"
      aria-hidden="true"
    >
      <Arrows suffix="" />
      {BAYS.map((bay, i) => (
        <g key={bay.label} className="plan-bay">
          <rect x={20 + i * 202} y={40} width={176} height={92} />
          <text x={30 + i * 202} y={57} className="plan-bay-label">
            {bay.label.toUpperCase()}
          </text>
        </g>
      ))}
      <line x1={126} y1={96} x2={292} y2={96} className="plan-edge" markerEnd="url(#rules-arrow)" />
      <line x1={328} y1={96} x2={494} y2={96} className="plan-edge" markerEnd="url(#rules-arrow)" />
      <ChainPath
        d="M 108 112 C 160 200, 460 200, 506 112"
        present={added}
        motion={motion}
        className="rules-violation"
        markerEnd="url(#rules-arrow-violation)"
      />
      {/* The break, across the import at its lowest point. */}
      <path d="M 298 186 l 6 -16 l 6 16 l 6 -16" className="rules-break" />
      {BAYS.map((bay, i) => (
        <g key={bay.member} transform={`translate(${108 + i * 202} 96)`}>
          <circle r={7} className="plan-joint" />
          <text y={-14} textAnchor="middle" className="plan-label">
            {bay.member}
          </text>
        </g>
      ))}
      <text x={310} y={232} textAnchor="middle" className="rules-label">
        {PROHIBITED}
      </text>
    </svg>
  );
}

/**
 * Phones: the same check redrawn upright. The bays stack, the allowed path runs straight down through them and
 * the new import bows out past their right edge, so every label keeps a phone-readable size. Drawn no wider than
 * 21rem, so its type stays near the size it has at 390 pixels on wider phones.
 */
function PortraitDrawing({ added, motion }: DrawingProps) {
  const joint = (i: number) => ({ x: 186, y: 62 + i * 116 });
  return (
    <svg
      viewBox="0 0 300 378"
      className="violation-portrait mx-auto block h-auto w-full max-w-[21rem] sm:hidden"
      aria-hidden="true"
    >
      <Arrows suffix="-portrait" />
      {BAYS.map((bay, i) => (
        <g key={bay.label} className="plan-bay">
          <rect x={10} y={10 + i * 116} width={200} height={80} />
          <text x={22} y={31 + i * 116} className="plan-bay-label">
            {bay.label.toUpperCase()}
          </text>
        </g>
      ))}
      {[0, 1].map((i) => (
        <line
          key={i}
          x1={joint(i).x}
          y1={joint(i).y + 10}
          x2={joint(i + 1).x}
          y2={joint(i + 1).y - 9}
          className="plan-edge"
          markerEnd="url(#rules-arrow-portrait)"
        />
      ))}
      <ChainPath
        d="M 194 64 C 300 92, 300 264, 194 292"
        present={added}
        motion={motion}
        className="rules-violation"
        markerEnd="url(#rules-arrow-violation-portrait)"
      />
      <path d="M 264 166 l -12 8 l 12 8 l -12 8" className="rules-break" />
      {BAYS.map((bay, i) => (
        <g key={bay.member} transform={`translate(${joint(i).x} ${joint(i).y})`}>
          <circle r={7} className="plan-joint" />
          <text x={-15} dy="0.34em" textAnchor="end" className="plan-label">
            {bay.member}
          </text>
        </g>
      ))}
      <text x={150} y={348} textAnchor="middle" className="rules-label">
        <tspan x={150}>prohibited:</tspan>
        <tspan x={150} dy="1.3em">
          {BAYS[0].label} → {BAYS[2].label}
        </tspan>
      </text>
    </svg>
  );
}
