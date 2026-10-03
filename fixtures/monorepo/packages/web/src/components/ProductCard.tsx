import { capitalize, type Money } from "@acme/shared";
import { PriceTag } from "./PriceTag";

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  summary: string;
  price: Money;
  inStock: boolean;
}

export function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <article className="product-card" data-slug={product.slug}>
      <h3>{capitalize(product.name)}</h3>
      <p>{product.summary}</p>
      <PriceTag price={product.price} muted={!product.inStock} />
    </article>
  );
}
