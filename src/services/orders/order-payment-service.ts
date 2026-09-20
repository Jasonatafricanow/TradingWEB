import { randomUUID } from "node:crypto";

import { orderPayments } from "@/storage/database/shared/schema";
import type { DbTx } from "./order-pricing-service";
import { formatCents, parseMoneyToCents } from "./order-money";

export type OrderPaymentChannel = "storefront" | "pos" | "import";
export type OrderPaymentStatus = "pending" | "recorded" | "failed" | "refunded";

export interface RecordOrderPaymentInput {
  orderId: string;
  channel: OrderPaymentChannel;
  method: string;
  label: string;
  amount: string;
  reference: string | null;
  providerTransactionId: string | null;
  status: OrderPaymentStatus;
  recordedBy: string | null;
}

export interface OrderPayment extends RecordOrderPaymentInput {
  id: string;
  createdAt: Date;
}

export interface OrderPaymentRepository {
  insert(payment: OrderPayment, tx: DbTx): Promise<void>;
}

export class OrderPaymentError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "OrderPaymentError";
  }
}

const databaseOrderPaymentRepository: OrderPaymentRepository = {
  async insert(payment, tx) {
    await tx.insert(orderPayments).values({
      id: payment.id,
      order_id: payment.orderId,
      channel: payment.channel,
      method: payment.method,
      label: payment.label,
      amount: payment.amount,
      reference: payment.reference,
      provider_transaction_id: payment.providerTransactionId,
      status: payment.status,
      recorded_by: payment.recordedBy,
      created_at: payment.createdAt,
    });
  },
};

function requiredText(value: string, code: string): string {
  const normalized = value.trim();
  if (!normalized) throw new OrderPaymentError(code);
  return normalized;
}

export async function recordOrderPayment(
  input: RecordOrderPaymentInput,
  tx: DbTx,
  repository: OrderPaymentRepository = databaseOrderPaymentRepository,
): Promise<OrderPayment> {
  if (!(["storefront", "pos", "import"] as string[]).includes(input.channel)) {
    throw new OrderPaymentError("PAYMENT_CHANNEL_INVALID");
  }

  let amountCents: number;
  try {
    amountCents = parseMoneyToCents(input.amount);
  } catch {
    throw new OrderPaymentError("PAYMENT_AMOUNT_INVALID");
  }
  if (amountCents <= 0) throw new OrderPaymentError("PAYMENT_AMOUNT_INVALID");

  const payment: OrderPayment = {
    ...input,
    id: randomUUID(),
    method: requiredText(input.method, "PAYMENT_METHOD_REQUIRED"),
    label: requiredText(input.label, "PAYMENT_LABEL_REQUIRED"),
    amount: formatCents(amountCents),
    reference: input.reference?.trim() || null,
    providerTransactionId: input.providerTransactionId?.trim() || null,
    createdAt: new Date(),
  };
  await repository.insert(payment, tx);
  return payment;
}
