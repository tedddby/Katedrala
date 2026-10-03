"use client";

import { useState, type ReactNode } from "react";
import {
  LoadDrawing,
  type DrawingEdge,
  type DrawingMember,
} from "@/components/drawing/LoadDrawing";
import { MEMBERS, MEMBER_FRAME, MODULE_FRAME, MODULE_MEMBERS } from "@/lib/demo/layout";
import {
  MAX_EDGE_LOAD,
  MAX_LEVEL,
  MAX_MODULE_EDGE_LOAD,
  MAX_MODULE_LEVEL,
  MODULE_EDGES,
  edgeLoad,
  formatScore,
  measurementOf,
  moduleEdgeLoad,
  moduleMeasurementOf,
} from "@/lib/demo/metrics";
import { EDGES, moduleName } from "@/lib/demo/system";
import { IdleCard, MemberCard } from "./MemberCard";
import { counted } from "@/lib/text";

const members: DrawingMember[] = MEMBERS.map((member) => {
  const m = measurementOf(member.id);
  return {
    ...member,
    load: m.load,
    description: `${member.id}, ${moduleName(m.node.module)} module, gravity ${formatScore(m.gravity)}`,
  };
});

const edges: DrawingEdge[] = EDGES.map((edge) => ({
  source: edge.source,
  target: edge.target,
  load: edgeLoad(edge.source, edge.target),
}));

const modules: DrawingMember[] = MODULE_MEMBERS.map((member) => {
  const m = moduleMeasurementOf(member.id);
  return {
    ...member,
    load: m.load,
    description: `${m.name} module, ${counted(m.members.length, "member")}`,
  };
});

const moduleEdges: DrawingEdge[] = MODULE_EDGES.map(([source, target]) => ({
  source,
  target,
  load: moduleEdgeLoad(source, target),
}));

function ModuleCard({ id }: { id: string }) {
  const m = moduleMeasurementOf(id);
  return (
    <div className="member-card">
      <p className="text-[0.9375rem] font-semibold text-ink">{m.name}</p>
      <dl className="mt-2.5 grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1.5 text-[0.8125rem]">
        <dt className="text-ink-faint">Members</dt>
        <dd className="data text-ink">{m.members.join(", ")}</dd>
        <dt className="text-ink-faint">Depends on</dt>
        <dd className="text-ink">
          {m.dependsOn.map((d) => moduleName(d)).join(", ") || "nothing inside the system"}
        </dd>
        <dt className="text-ink-faint">Depended on by</dt>
        <dd className="text-ink">
          {m.dependedOnBy.map((d) => moduleName(d)).join(", ") || "nothing"}
        </dd>
      </dl>
    </div>
  );
}

/**
 * The hero stage: copy on the left with the inspection card beneath it, the load drawing on the right.
 * Wide screens draw every member; small screens draw the module-level reduction of the same system.
 */
export function HeroStage({ copy, titleBlock }: { copy: ReactNode; titleBlock: ReactNode }) {
  const [member, setMember] = useState<string | null>(null);
  const [module, setModule] = useState<string | null>(null);

  return (
    <div className="frame grid-12 gap-y-10">
      <div className="col-span-12 flex flex-col md:col-span-5 md:pt-8 lg:pt-12">
        {copy}
        <div className="mt-auto hidden pt-12 md:block" aria-live="polite">
          {member === null ? <IdleCard /> : <MemberCard id={member} />}
        </div>
      </div>

      <div className="col-span-12 md:col-span-7">
        <div className="hidden md:block">
          <LoadDrawing
            frame={MEMBER_FRAME}
            members={members}
            edges={edges}
            maxEdgeLoad={MAX_EDGE_LOAD}
            levels={MAX_LEVEL}
            title="Load drawing of the demonstration system: 16 members on 8 load levels, each resting on what it depends on"
            active={member}
            onActiveChange={setMember}
          />
        </div>
        <div className="md:hidden">
          <LoadDrawing
            frame={MODULE_FRAME}
            members={modules}
            edges={moduleEdges}
            maxEdgeLoad={MAX_MODULE_EDGE_LOAD}
            levels={MAX_MODULE_LEVEL}
            title="Load drawing of the demonstration system by module: 8 modules on 6 load levels"
            active={module}
            onActiveChange={setModule}
            labelSize={17}
          />
        </div>
        {titleBlock}
        <div className="mt-4 md:hidden" aria-live="polite">
          {module === null ? <IdleCard /> : <ModuleCard id={module} />}
        </div>
      </div>
    </div>
  );
}
