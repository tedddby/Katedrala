import { isPurchasable, type Product } from "./product";

const PRODUCTS: readonly Product[] = [
  {
    sku: "BEAN-ETH-250",
    name: "Ethiopia Yirgacheffe 250 g",
    description: "Washed heirloom varieties, floral with notes of bergamot",
    category: "coffee/single-origin",
    netPriceCents: 1190,
    taxCategory: "reduced",
    weightGrams: 270,
    active: true,
    releasedAt: "2024-03-01",
  },
  {
    sku: "BEAN-COL-1000",
    name: "Colombia Huila 1 kg",
    description: "Caramel sweetness, red apple, medium body",
    category: "coffee/single-origin",
    netPriceCents: 3490,
    taxCategory: "reduced",
    weightGrams: 1050,
    active: true,
    releasedAt: "2023-11-15",
  },
  {
    sku: "BEAN-ESP-1000",
    name: "House Espresso 1 kg",
    description: "Chocolate and hazelnut blend for espresso machines",
    category: "coffee/blends",
    netPriceCents: 2690,
    taxCategory: "reduced",
    weightGrams: 1050,
    active: true,
    releasedAt: "2022-05-01",
  },
  {
    sku: "GRIND-HAND-01",
    name: "Hand Grinder",
    description: "Steel conical burrs, 40 click settings",
    category: "equipment/grinders",
    netPriceCents: 8900,
    taxCategory: "standard",
    weightGrams: 650,
    active: true,
    releasedAt: "2023-02-01",
  },
  {
    sku: "KETTLE-GN-06",
    name: "Gooseneck Kettle 0.6 l",
    description: "Precise pour for filter coffee",
    category: "equipment/kettles",
    netPriceCents: 4490,
    taxCategory: "standard",
    weightGrams: 800,
    active: true,
    releasedAt: "2023-02-01",
  },
  {
    sku: "FILTER-V60-100",
    name: "Paper Filters (100)",
    description: "Cone filters, size 02",
    category: "equipment/accessories",
    netPriceCents: 590,
    taxCategory: "standard",
    weightGrams: 120,
    active: false,
    releasedAt: "2021-09-01",
  },
];

export interface ListOptions {
  purchasableOnly?: boolean;
  category?: string;
}

export function findProduct(sku: string): Product | undefined {
  return PRODUCTS.find((product) => product.sku === sku);
}

export function listProducts(options: ListOptions = {}): Product[] {
  return PRODUCTS.filter(
    (product) =>
      (!options.purchasableOnly || isPurchasable(product)) &&
      (options.category === undefined ||
        product.category === options.category ||
        product.category.startsWith(`${options.category}/`)),
  );
}
