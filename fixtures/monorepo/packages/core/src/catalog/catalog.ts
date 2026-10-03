import { isInStock, type Product } from "./product";

export class Catalog {
  private readonly products = new Map<string, Product>();

  add(product: Product): void {
    this.products.set(product.id, product);
  }

  find(id: string): Product | undefined {
    return this.products.get(id);
  }

  findBySlug(slug: string): Product | undefined {
    return this.list().find((product) => product.slug === slug);
  }

  list(): Product[] {
    return [...this.products.values()];
  }

  reserve(id: string, quantity: number): Product {
    const product = this.products.get(id);
    if (product === undefined) {
      throw new Error(`Unknown product ${id}`);
    }
    if (!isInStock(product, quantity)) {
      throw new Error(`Only ${product.stock} x ${product.name} left`);
    }
    const updated = { ...product, stock: product.stock - quantity };
    this.products.set(id, updated);
    return updated;
  }
}
