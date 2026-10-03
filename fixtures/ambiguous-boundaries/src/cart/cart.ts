export interface CartItem {
  sku: string;
  name: string;
  quantity: number;
  netUnitCents: number;
  taxCategory: "standard" | "reduced";
  weightGrams: number;
}

export interface Cart {
  sessionId: string;
  items: CartItem[];
  updatedAt: string;
}

export function emptyCart(sessionId: string): Cart {
  return { sessionId, items: [], updatedAt: new Date().toISOString() };
}

export function addItem(cart: Cart, item: CartItem): Cart {
  const existing = cart.items.find((candidate) => candidate.sku === item.sku);
  const items =
    existing === undefined
      ? [...cart.items, item]
      : cart.items.map((candidate) =>
          candidate.sku === item.sku ? { ...candidate, quantity: candidate.quantity + item.quantity } : candidate,
        );
  return { ...cart, items, updatedAt: new Date().toISOString() };
}

export function removeItem(cart: Cart, sku: string): Cart {
  return { ...cart, items: cart.items.filter((item) => item.sku !== sku), updatedAt: new Date().toISOString() };
}

export function itemCount(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.quantity, 0);
}

export function merchandiseNetCents(cart: Cart): number {
  return cart.items.reduce((sum, item) => sum + item.netUnitCents * item.quantity, 0);
}
