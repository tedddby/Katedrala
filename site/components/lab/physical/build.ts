import { PLAN, rigOptions, type Profile } from "./config";
import { buildModel, type GraphData, type Model } from "./model";
import { layoutPlan, type Plan } from "./plan";
import { buildRig, type Rig } from "./rig";

export interface Built {
  readonly model: Model;
  readonly plan: Plan;
  readonly rig: Rig;
  /** Height of one level, model units. */
  readonly unit: number;
  /** The board turns over about the structure's mid-height: (0, pivotY, 0) in the board's frame. */
  readonly pivotY: number;
}

/** The model, the plan and the rig, from the data: deterministic, so the worker and the stage build the same one. */
export function buildAll(data: GraphData, profile: Profile): Built {
  const model = buildModel(data);
  const plan = layoutPlan(model, PLAN);
  const options = rigOptions(profile);
  const rig = buildRig(model, { plan, ...options });
  const pivotY = -(model.maxLevel * options.unit * 1.04) / 2;
  return { model, plan, rig, unit: options.unit, pivotY };
}
