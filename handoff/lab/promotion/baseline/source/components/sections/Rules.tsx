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

// The check, computed: the demonstration system with one hypothetical import added, against the rules above.
const VIOLATIONS = checkRules([...EDGES, RULE_CHANGE]);
const VIOLATION = VIOLATIONS[0]!;
const RULE = VIOLATION.rule;
const RULE_TEXT = `${capitalized(RULE.from ?? RULE.module ?? "")} cannot depend on ${listed(RULE.cannotDependOn)}.`;
/** The route the system already has between the same two members, and whether the rules allow it. */
const ROUTE = pathFrom(VIOLATION.source, impactOf(VIOLATION.target));
const VIA = ROUTE.slice(1, -1);
const ROUTE_ALLOWED = checkRules(EDGES).every(
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
const DESCRIPTION = `Hypothetical change to the demonstration system: ${VIOLATION.source} reaches ${VIOLATION.target} through ${listed(VIA)}${ROUTE_ALLOWED ? ", which is allowed" : ""}; a new direct import from ${VIOLATION.source} to ${VIOLATION.target} breaks the rule ${RULE.id}. ${RULE_TEXT}`;

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Architectural rules: intent written in configuration, checked on every change. */
export function Rules() {
  return (
    <Section
      id="rules"
      title="Write down the architecture you intend."
      lede="Rules in katedrala.config.yaml will check every change for forbidden dependencies, layering, isolation, cycles and fan-out."
      aside={<Status status="planned" />}
    >
      <div className="grid-12 gap-y-8">
        <div className="col-span-12 lg:col-span-5">
          <CodeBlock
            label="katedrala.config.yaml"
            language="yaml"
            code={toYaml(RULE_CONFIG)}
            className="h-full"
          />
        </div>
        <div className="col-span-12 flex lg:col-span-7">
          <figure className="violation flex-1">
            <div className="violation-header">
              <span>hypothetical change</span>
              <span className="text-ink-soft">
                + {VIOLATION.source} → {VIOLATION.target}
              </span>
            </div>
            <div className="violation-body" role="img" aria-label={DESCRIPTION}>
              <LandscapeDrawing />
              <PortraitDrawing />
            </div>
            <figcaption className="violation-report">
              <p className="data text-load">
                {RULE.severity}&nbsp;&nbsp;{RULE.id}
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
              <p className="data mt-3 text-ink-faint">{VIOLATION.file}</p>
              <p className="data mt-1 text-ink-faint">
                {counted(VIOLATIONS.length, "error")}, {counted(RULE_CONFIG.rules.length, "rule")}{" "}
                checked
              </p>
            </figcaption>
          </figure>
        </div>
      </div>
      <p className="footnote">
        Demonstration system, with one hypothetical import added. The configuration syntax is the
        one Katedrala's rule fixtures use today; the report layout is a preview.
      </p>
    </Section>
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

/**
 * From small tablets up: the three bays side by side, the allowed path along them and the new import arcing
 * under the service bay. Its type steps up where the drawing renders small (rules-evidence.css).
 */
function LandscapeDrawing() {
  return (
    <svg
      viewBox="0 0 620 230"
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
      <path
        d="M 108 112 C 160 200, 460 200, 506 112"
        className="rules-violation"
        markerEnd="url(#rules-arrow-violation)"
      />
      <path d="M 300 166 l 8 -12 l 8 12 l 8 -12" className="rules-break" />
      {BAYS.map((bay, i) => (
        <g key={bay.member} transform={`translate(${108 + i * 202} 96)`}>
          <circle r={7} className="plan-joint" />
          <text y={-14} textAnchor="middle" className="plan-label">
            {bay.member}
          </text>
        </g>
      ))}
      <text x={310} y={214} textAnchor="middle" className="rules-label">
        {PROHIBITED}
      </text>
    </svg>
  );
}

/**
 * Phones: the same check redrawn upright. The bays stack, the allowed path runs straight down through them and
 * the new import bows out past their right edge, so every label keeps a phone-readable size.
 */
function PortraitDrawing() {
  const joint = (i: number) => ({ x: 186, y: 62 + i * 116 });
  return (
    <svg
      viewBox="0 0 300 378"
      className="violation-portrait block h-auto w-full sm:hidden"
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
      <path
        d="M 194 64 C 300 92, 300 264, 194 292"
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
