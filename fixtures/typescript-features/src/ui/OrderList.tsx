import { useMemo, useState } from "react";
import { formatMoney } from "@/utils/money";
import { calculateTotal, OrderStatus, type Order } from "@/orders/order";

export interface OrderListProps {
  readonly orders: readonly Order[];
  readonly onSelect?: (order: Order) => void;
}

interface OrderRowProps {
  readonly order: Order;
  readonly selected: boolean;
  readonly onClick: () => void;
}

export function OrderRow({ order, selected, onClick }: OrderRowProps) {
  return (
    <tr className={selected ? "selected" : undefined} onClick={onClick}>
      <td>{order.id}</td>
      <td>{order.status}</td>
      <td className="amount">{formatMoney(calculateTotal(order.lines))}</td>
    </tr>
  );
}

export function OrderList({ orders, onSelect }: OrderListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const compact = __SHOP_FLAGS__?.compactOrders ?? false;
  const visible = useMemo(() => orders.filter((order) => order.status !== OrderStatus.Cancelled), [orders]);

  return (
    <table className={compact ? "orders compact" : "orders"}>
      <tbody>
        {visible.map((order) => (
          <OrderRow
            key={order.id}
            order={order}
            selected={order.id === selectedId}
            onClick={() => {
              setSelectedId(order.id);
              onSelect?.(order);
            }}
          />
        ))}
      </tbody>
    </table>
  );
}
