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
  OTHER_MEMBERS,
  edgeLoad,
  formatScore,
  measurementOf,
  moduleEdgeLoad,
  moduleMeasurementOf,
} from "@/lib/demo/metrics";
import { EDGES, moduleName } from "@/lib/demo/system";
import { counted, rests } from "@/lib/text";
import {
  HEAVIEST_MEMBER,
  HEAVIEST_MODULE,
  IdleCard,
  MemberCard,
  MemberCardSizer,
  ModuleCard,
  ModuleCardSizer,
  ModuleIdleCard,
  OTHER_MODULES,
  modulesRestingOn,
  shareOf,
} from "./MemberCard";

const members: DrawingMember[] = MEMBERS.map((member) => {
  const m = measurementOf(member.id);
  const resting = m.transitiveDependents.length;
  return {
    ...member,
    load: m.load,
    description: `${member.id}, ${moduleName(m.node.module)} module, gravity ${formatScore(m.gravity)}`,
    detail: `Depends on ${m.dependsOn.join(", ") || "nothing inside the system"}. ${shareOf(resting, OTHER_MEMBERS, "members")} ${rests(resting)} on it.`,
  };
});

const edges: DrawingEdge[] = EDGES.map((edge) => ({
  source: edge.source,
  target: edge.target,
  load: edgeLoad(edge.source, edge.target),
}));

const modules: DrawingMember[] = MODULE_MEMBERS.map((member) => {
  const m = moduleMeasurementOf(member.id);
  const resting = modulesRestingOn(member.id).length;
  return {
    ...member,
    load: m.load,
    description: `${m.name} module, ${counted(m.members.length, "member")}`,
    detail: `Members: ${m.members.join(", ")}. ${shareOf(resting, OTHER_MODULES, "modules")} ${rests(resting)} on it.`,
  };
});

const moduleEdges: DrawingEdge[] = MODULE_EDGES.map(([source, target]) => ({
  source,
  target,
  load: moduleEdgeLoad(source, target),
}));

/**
 * A card slot that keeps one height whichever card it shows, so neither the page nor the card's frame moves
 * while members are tested: invisible sizers (the longest value of every row, and the resting card) share the
 * grid cell with the live card, which stretches to fill it.
 */
function CardSlot({ sizers, children }: { sizers: readonly ReactNode[]; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 *:col-start-1 *:row-start-1">
      {sizers.map((sizer, i) => (
        <div key={i} aria-hidden="true" className="invisible">
          {sizer}
        </div>
      ))}
      {children}
    </div>
  );
}

/**
 * The hero stage: copy on the left with the inspection card beneath it, the load drawing on the right; stacked
 * below lg with the card under the drawing. Small screens draw the module-level reduction of the same system.
 * At rest each drawing tests the unit that carries the most load; hover previews another, a click, a tap or
 * Enter selects it, Escape returns to rest.
 */
export function HeroStage({ copy, titleBlock }: { copy: ReactNode; titleBlock: ReactNode }) {
  const [member, setMember] = useState<string | null>(null);
  const [module, setModule] = useState<string | null>(null);
  const memberSlot = (
    <CardSlot sizers={[<MemberCardSizer key="rows" />, <IdleCard key="rest" />]}>
      {member === null ? <IdleCard /> : <MemberCard id={member} />}
    </CardSlot>
  );

  return (
    <div className="frame grid-12 gap-y-10">
      <div className="col-span-12 flex flex-col lg:col-span-5 lg:pt-12">
        {copy}
        <div className="mt-auto hidden pt-12 lg:block">{memberSlot}</div>
      </div>

      {/* Below sm the module drawing stops at its own width (30rem), so its labels never outgrow the lede. */}
      <div className="col-span-12 max-w-[30rem] sm:max-w-[48rem] lg:col-span-7 lg:max-w-none">
        <div className="hidden sm:block">
          <LoadDrawing
            frame={MEMBER_FRAME}
            members={members}
            edges={edges}
            maxEdgeLoad={MAX_EDGE_LOAD}
            levels={MAX_LEVEL}
            title="Load drawing of the demonstration system: 16 members on 8 load levels, each resting on what it depends on"
            resting={HEAVIEST_MEMBER}
            onTestedChange={setMember}
          />
        </div>
        <div className="sm:hidden">
          <LoadDrawing
            frame={MODULE_FRAME}
            members={modules}
            edges={moduleEdges}
            maxEdgeLoad={MAX_MODULE_EDGE_LOAD}
            levels={MAX_MODULE_LEVEL}
            title="Load drawing of the demonstration system by module: 8 modules on 6 load levels, each resting on what it depends on"
            resting={HEAVIEST_MODULE}
            onTestedChange={setModule}
            labelSize={17}
          />
        </div>
        <div className="mt-4 sm:hidden">
          <CardSlot sizers={[<ModuleCardSizer key="rows" />, <ModuleIdleCard key="rest" />]}>
            {module === null ? <ModuleIdleCard /> : <ModuleCard id={module} />}
          </CardSlot>
        </div>
        <div className="mt-4 hidden sm:block lg:hidden">{memberSlot}</div>
        {titleBlock}
      </div>
    </div>
  );
}
