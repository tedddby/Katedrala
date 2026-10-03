import { useEffect, useState } from "react";
import { OrderList } from "./OrderList";
import { customerDisplayName, type Customer, type Order } from "@/customers";

export interface AppProps {
  readonly customer: Customer;
  readonly loadOrders: (customerId: string) => Promise<Order[]>;
}

export function App({ customer, loadOrders }: AppProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadOrders(customer.id).then((loaded) => {
      if (!cancelled) setOrders(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [customer.id, loadOrders]);

  return (
    <main>
      <h1>Orders for {customerDisplayName(customer)}</h1>
      <OrderList orders={orders} onSelect={setSelected} />
      {selected !== null && <p className="selection">Selected order {selected.id}</p>}
    </main>
  );
}

export default App;
