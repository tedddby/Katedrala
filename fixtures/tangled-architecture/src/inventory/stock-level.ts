export interface StockLevel {
  id: string;
  productId: string;
  warehouseId: string;
  onHand: number;
  reserved: number;
}

export const LOW_STOCK_THRESHOLD = 5;

export function available(level: StockLevel): number {
  return Math.max(0, level.onHand - level.reserved);
}
