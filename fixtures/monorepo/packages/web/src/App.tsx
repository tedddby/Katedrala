import { useEffect, useState } from "react";
import { ProductCard, type ProductSummary } from "./components/ProductCard";

interface AppProps {
  apiUrl: string;
}

type ProductGroups = Partial<Record<"available" | "soldOut", ProductSummary[]>>;

export function App({ apiUrl }: AppProps) {
  const [groups, setGroups] = useState<ProductGroups>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiUrl}/products`, { signal: controller.signal })
      .then((response) => response.json() as Promise<ProductGroups>)
      .then(setGroups)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(String(reason));
        }
      });
    return () => controller.abort();
  }, [apiUrl]);

  if (error !== null) {
    return <p role="alert">Could not load products: {error}</p>;
  }

  return (
    <main>
      <h1>Acme Store</h1>
      <section>
        <h2>In stock</h2>
        {(groups.available ?? []).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
      <section>
        <h2>Sold out</h2>
        {(groups.soldOut ?? []).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </section>
    </main>
  );
}
