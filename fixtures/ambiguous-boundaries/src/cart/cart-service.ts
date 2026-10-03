import { findProduct } from "../catalog/product-repository";
import { isValidSessionId, newSessionId } from "../common/session";
import { addItem, removeItem, type Cart, type CartItem } from "./cart";
import { canAdd } from "./cart-rules";
import { CartStore } from "./cart-store";

export class CartError extends Error {}

export class CartService {
  constructor(private readonly store: CartStore = new CartStore()) {}

  open(sessionId?: string): Cart {
    const id = sessionId !== undefined && isValidSessionId(sessionId) ? sessionId : newSessionId();
    return this.store.load(id);
  }

  add(sessionId: string, sku: string, quantity = 1): Cart {
    const product = findProduct(sku);
    if (product === undefined || !product.active) {
      throw new CartError(`Unknown product ${sku}`);
    }
    const cart = this.store.load(sessionId);
    const item: CartItem = {
      sku,
      name: product.name,
      quantity,
      netUnitCents: product.netPriceCents,
      taxCategory: product.taxCategory,
      weightGrams: product.weightGrams,
    };
    if (!canAdd(cart, item)) {
      throw new CartError(`Cannot add ${quantity} x ${sku} to the cart`);
    }
    const updated = addItem(cart, item);
    this.store.save(updated);
    return updated;
  }

  remove(sessionId: string, sku: string): Cart {
    const updated = removeItem(this.store.load(sessionId), sku);
    this.store.save(updated);
    return updated;
  }

  clear(sessionId: string): void {
    this.store.delete(sessionId);
  }
}
