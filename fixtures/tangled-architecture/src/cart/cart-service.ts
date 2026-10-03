import { getProduct, unitPrice } from "../catalog";
import { beginCheckout, type CheckoutSession } from "../checkout/checkout-service";
import { tierFor } from "../customers/loyalty";
import { totalAvailable } from "../inventory/stock-service";
import type { Cart, CartItem } from "./cart";
import { createCart, deleteCart, findCart, saveCart } from "./cart-repository";

export class CartError extends Error {}

function requireCart(cartId: string): Cart {
  const cart = findCart(cartId);
  if (cart === undefined) {
    throw new CartError(`Cart ${cartId} not found`);
  }
  return cart;
}

export function openCart(customerId: string | null): Cart {
  return createCart(customerId);
}

export function addItem(cartId: string, productId: string, quantity = 1): Cart {
  const cart = requireCart(cartId);
  const product = getProduct(productId);
  if (product === undefined) {
    throw new CartError(`Unknown product ${productId}`);
  }

  const existing = cart.items.find((item) => item.product.id === productId);
  const wanted = (existing?.quantity ?? 0) + quantity;
  const inStock = totalAvailable(productId);
  if (wanted > inStock) {
    throw new CartError(`Only ${inStock} x ${product.name} available`);
  }

  const tier = cart.customerId === null ? undefined : tierFor(cart.customerId);
  const line: CartItem = { product, quantity: wanted, unitPriceCents: unitPrice(product, tier) };
  const items = existing === undefined ? [...cart.items, line] : cart.items.map((item) => (item === existing ? line : item));
  return saveCart({ ...cart, items });
}

export function removeItem(cartId: string, productId: string): Cart {
  const cart = requireCart(cartId);
  return saveCart({ ...cart, items: cart.items.filter((item) => item.product.id !== productId) });
}

/** Moves the items of an anonymous cart into the customer's cart after sign-in. */
export function mergeCarts(guestCartId: string, customerCartId: string): Cart {
  const guest = requireCart(guestCartId);
  let merged = requireCart(customerCartId);
  for (const item of guest.items) {
    merged = addItem(merged.id, item.product.id, item.quantity);
  }
  deleteCart(guest.id);
  return merged;
}

export function clearCart(cartId: string): void {
  deleteCart(cartId);
}

export function checkout(cartId: string): CheckoutSession {
  const cart = requireCart(cartId);
  if (cart.items.length === 0) {
    throw new CartError("Cannot check out an empty cart");
  }
  return beginCheckout(cart);
}
