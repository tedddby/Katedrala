import { findOrder } from "../checkout/order-history";
import { subscribe } from "../lib/events";
import { commitReservations } from "./reservations";
import { adjustStock } from "./stock-service";
import { DEFAULT_WAREHOUSE } from "./warehouses";

// Registered at startup: src/main.ts imports this module for its side effects.

subscribe("order.placed", ({ orderId }) => {
  for (const reservation of commitReservations(orderId)) {
    adjustStock(reservation.productId, reservation.warehouseId, -reservation.quantity);
  }
});

subscribe("order.refunded", ({ orderId }) => {
  const order = findOrder(orderId);
  if (order === undefined) {
    return;
  }
  for (const line of order.lines) {
    adjustStock(line.productId, DEFAULT_WAREHOUSE.id, line.quantity);
  }
});
