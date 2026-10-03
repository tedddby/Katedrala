import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Payment, PaymentStatus } from "../../payments/entities/payment.entity";

export enum OrderStatus {
  Open = "open",
  Paid = "paid",
  Cancelled = "cancelled",
}

@Entity("orders")
export class Order {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "customer_id", type: "uuid" })
  customerId: string;

  @Column({ name: "total_cents", type: "integer" })
  totalCents: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: "enum", enum: OrderStatus, default: OrderStatus.Open })
  status: OrderStatus;

  @OneToMany(() => Payment, (payment) => payment.order)
  payments: Payment[];

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  /** Sum of successful payments. Requires the `payments` relation to be loaded. */
  get paidCents(): number {
    return (this.payments ?? [])
      .filter((payment) => payment.status === PaymentStatus.Succeeded)
      .reduce((sum, payment) => sum + payment.amountCents, 0);
  }
}
