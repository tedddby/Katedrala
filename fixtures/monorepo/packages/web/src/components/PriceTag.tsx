import { formatMoney, type Money } from "@acme/shared";

interface PriceTagProps {
  price: Money;
  muted?: boolean;
}

export function PriceTag({ price, muted = false }: PriceTagProps) {
  return <span className={muted ? "price price--muted" : "price"}>{formatMoney(price)}</span>;
}
