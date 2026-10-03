export interface OrderLine {
  sku: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export function lineTotal(line: OrderLine): number {
  return line.quantity * line.unitPriceCents;
}

export function isValidLine(line: OrderLine): boolean {
  return (
    line.sku.trim().length > 0 &&
    Number.isInteger(line.quantity) &&
    line.quantity > 0 &&
    Number.isInteger(line.unitPriceCents) &&
    line.unitPriceCents >= 0
  );
}
