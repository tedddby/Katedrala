import { CodeBlock } from "@/components/ui/CodeBlock";
import { Section } from "@/components/ui/Section";
import { Status } from "@/components/ui/Status";

const CONFIG = `groups:
  controllers: ["src/**/*.controller.ts"]
  repositories: ["src/**/*.repository.ts"]

modules:
  payments: ["src/payments/**"]
  analytics: ["src/analytics/**"]

rules:
  - id: controllers-no-database
    severity: error
    from: controllers
    cannot_depend_on: [repositories]

  - id: payments-isolation
    severity: error
    module: payments
    cannot_depend_on: [analytics]`;

/** Architectural rules: intent written in configuration, enforced on every change. */
export function Rules() {
  return (
    <Section
      id="rules"
      title="Write down the architecture you intend."
      lede="Rules live in katedrala.config.yaml beside the code: forbidden and allowed dependencies, layers, isolation, cycles and fan-out. Every change is checked against them, on your machine or in CI."
      aside={<Status status="planned" />}
    >
      <div className="grid-12 gap-y-8">
        <div className="col-span-12 lg:col-span-5">
          <CodeBlock label="katedrala.config.yaml" language="yaml" code={CONFIG} />
        </div>
        <div className="col-span-12 flex flex-col gap-6 lg:col-span-7">
          <figure className="violation">
            <ViolationDrawing />
            <figcaption className="violation-report">
              <p className="data text-load">error&nbsp;&nbsp;controllers-no-database</p>
              <p className="mt-2 text-[0.9375rem] text-ink">
                OrderController now depends on OrderRepository.
              </p>
              <p className="mt-1 text-[0.875rem] text-ink-soft">
                Controllers cannot depend on repositories. The path through OrderService is allowed;
                the new import skips it.
              </p>
              <p className="data mt-3 text-ink-faint">src/orders/order.controller.ts:7</p>
            </figcaption>
          </figure>
        </div>
      </div>
      <p className="mt-6 text-[0.8125rem] text-ink-faint">
        The configuration syntax is the one Katedrala's rule fixtures use today. The report shows
        the planned v1 format.
      </p>
    </Section>
  );
}

/** The violation as a drawing: the allowed path through the service, and the new member that skips it. */
function ViolationDrawing() {
  return (
    <svg
      viewBox="0 0 620 230"
      className="block h-auto w-full"
      role="img"
      aria-label="OrderController reaches OrderRepository through OrderService, which is allowed; a new direct dependency from OrderController to OrderRepository violates the rule."
    >
      <defs>
        <marker
          id="rules-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0.5 1 7 4 0.5 7" fill="none" strokeWidth="1.2" className="plan-arrow" />
        </marker>
        <marker
          id="rules-arrow-violation"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path
            d="M0.5 1 7 4 0.5 7"
            fill="none"
            strokeWidth="1.2"
            className="plan-arrow-dependency"
          />
        </marker>
      </defs>
      {[
        { label: "CONTROLLERS", x: 20 },
        { label: "SERVICES", x: 222 },
        { label: "REPOSITORIES", x: 424 },
      ].map((bay) => (
        <g key={bay.label} className="plan-bay">
          <rect x={bay.x} y={40} width={176} height={92} />
          <text x={bay.x + 10} y={56} className="plan-bay-label">
            {bay.label}
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
      {[
        { id: "OrderController", x: 108 },
        { id: "OrderService", x: 310 },
        { id: "OrderRepository", x: 512 },
      ].map((member) => (
        <g key={member.id} transform={`translate(${member.x} 96)`}>
          <circle r={7} className="plan-joint" />
          <text y={-14} textAnchor="middle" className="plan-label">
            {member.id}
          </text>
        </g>
      ))}
      <text x={310} y={214} textAnchor="middle" className="rules-label">
        prohibited: controllers → repositories
      </text>
    </svg>
  );
}
