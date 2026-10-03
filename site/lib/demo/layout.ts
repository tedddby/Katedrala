/**
 * Drawing coordinates for the demonstration system. Members sit on their load-path level (computed in
 * metrics.ts): foundations on the ground line, everything else one level above the highest member it rests on.
 * Only the horizontal placement is authored, to keep each drawing legible.
 */
import { MODULE_MEASUREMENTS, measurementOf } from "./metrics";
import { MODULES, NODES, type ModuleId } from "./system";

export type LabelSide = "left" | "right" | "above" | "below";

export interface DrawingFrame {
  readonly width: number;
  readonly height: number;
  /** y of the ground line (level 0). */
  readonly ground: number;
  /** Vertical distance between load-path levels. */
  readonly step: number;
}

export interface PlacedMember {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly level: number;
  readonly side: LabelSide;
}

export const MEMBER_FRAME: DrawingFrame = { width: 760, height: 566, ground: 496, step: 62 };
export const MODULE_FRAME: DrawingFrame = { width: 480, height: 452, ground: 384, step: 66 };

export function levelY(frame: DrawingFrame, level: number): number {
  return frame.ground - level * frame.step;
}

const MEMBER_X: Record<string, { x: number; side: LabelSide }> = {
  ApiGateway: { x: 432, side: "right" },
  CheckoutController: { x: 262, side: "left" },
  CheckoutService: { x: 214, side: "left" },
  OrderController: { x: 470, side: "left" },
  OrderService: { x: 408, side: "left" },
  InvoiceService: { x: 560, side: "right" },
  PaymentService: { x: 318, side: "left" },
  UserService: { x: 566, side: "right" },
  AuthService: { x: 676, side: "above" },
  PaymentRepository: { x: 232, side: "left" },
  OrderRepository: { x: 408, side: "right" },
  UserRepository: { x: 578, side: "right" },
  SessionStore: { x: 676, side: "below" },
  StripeClient: { x: 318, side: "below" },
  Database: { x: 408, side: "below" },
  EventBus: { x: 500, side: "below" },
};

export const MEMBERS: readonly PlacedMember[] = NODES.map((node) => {
  const placement = MEMBER_X[node.id];
  if (placement === undefined) throw new Error(`No drawing position for ${node.id}`);
  const level = measurementOf(node.id).level;
  return {
    id: node.id,
    label: node.id,
    x: placement.x,
    y: levelY(MEMBER_FRAME, level),
    level,
    side: placement.side,
  };
});

const MODULE_X: Record<ModuleId, { x: number; side: LabelSide }> = {
  gateway: { x: 252, side: "right" },
  checkout: { x: 140, side: "left" },
  orders: { x: 262, side: "right" },
  billing: { x: 300, side: "right" },
  auth: { x: 440, side: "above" },
  payments: { x: 174, side: "left" },
  users: { x: 322, side: "right" },
  platform: { x: 262, side: "below" },
};

export const MODULE_MEMBERS: readonly PlacedMember[] = MODULES.map((module) => {
  const measurement = MODULE_MEASUREMENTS.get(module.id)!;
  const placement = MODULE_X[module.id];
  return {
    id: module.id,
    label: module.name,
    x: placement.x,
    y: levelY(MODULE_FRAME, measurement.level),
    level: measurement.level,
    side: placement.side,
  };
});
