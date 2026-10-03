import { emptyCart, type Cart } from "./cart";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class CartStore {
  private readonly carts = new Map<string, Cart>();

  constructor(private readonly ttlMs = WEEK_MS) {}

  load(sessionId: string): Cart {
    const cart = this.carts.get(sessionId);
    if (cart === undefined || Date.parse(cart.updatedAt) + this.ttlMs < Date.now()) {
      return emptyCart(sessionId);
    }
    return cart;
  }

  save(cart: Cart): void {
    this.carts.set(cart.sessionId, cart);
  }

  delete(sessionId: string): void {
    this.carts.delete(sessionId);
  }
}
