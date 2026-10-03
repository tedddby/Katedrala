import { slugify } from "../common/slug";
import { stockLevel } from "./inventory";
import { listProducts } from "./product-repository";

export interface Category {
  slug: string;
  name: string;
  children: Category[];
  productCount: number;
  inStockCount: number;
}

function ensureChild(children: Category[], name: string, parentSlug: string): Category {
  const slug = parentSlug === "" ? slugify(name) : `${parentSlug}/${slugify(name)}`;
  let category = children.find((candidate) => candidate.slug === slug);
  if (category === undefined) {
    category = { slug, name, children: [], productCount: 0, inStockCount: 0 };
    children.push(category);
  }
  return category;
}

export function categoryTree(): Category[] {
  const roots: Category[] = [];
  for (const product of listProducts({ purchasableOnly: true })) {
    const inStock = stockLevel(product.sku) > 0;
    let children = roots;
    let parentSlug = "";
    for (const name of product.category.split("/")) {
      const category = ensureChild(children, name, parentSlug);
      category.productCount++;
      if (inStock) category.inStockCount++;
      children = category.children;
      parentSlug = category.slug;
    }
  }
  return roots;
}

export function descendantsOf(slug: string): string[] {
  const result: string[] = [];
  const visit = (categories: Category[], inside: boolean): void => {
    for (const category of categories) {
      const match = inside || category.slug === slug;
      if (match) result.push(category.slug);
      visit(category.children, match);
    }
  };
  visit(categoryTree(), false);
  return result;
}
