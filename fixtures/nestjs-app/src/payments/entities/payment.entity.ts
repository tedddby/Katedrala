import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Order } from "src/orders/entities/order.entity";

export enum PaymentStatus {
  Pending = "pending",
  Succeeded = "succeeded",
  Failed = "failed",
}

@Entity()
export class Payment {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ name: "order_id", type: "uuid" })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.payments, { onDelete: "CASCADE" })
  @JoinColumn({ name: "order_id" })
  order: Order;

  @Column({ name: "amount_cents", type: "integer" })
  amountCents: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ type: "enum", enum: PaymentStatus, default: PaymentStatus.Pending })
  status: PaymentStatus;

  @Column({ name: "provider_reference", type: "varchar", nullable: true })
  providerReference: string | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
