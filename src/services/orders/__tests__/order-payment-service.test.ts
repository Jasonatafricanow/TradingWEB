import { describe, expect, it } from "vitest";

import {
  recordOrderPayment,
  type OrderPayment,
  type OrderPaymentRepository,
} from "../order-payment-service";

function fakeRepository() {
  const rows: OrderPayment[] = [];
  const repository: OrderPaymentRepository = {
    insert: async (payment) => {
      rows.push(payment);
    },
  };
  return { repository, rows };
}

describe("recordOrderPayment", () => {
  it("normalizes and records a POS cash payment", async () => {
    const { repository, rows } = fakeRepository();
    const payment = await recordOrderPayment({
      orderId: "order-1",
      channel: "pos",
      method: "cash",
      label: " 现金 ",
      amount: "10.5",
      reference: null,
      providerTransactionId: null,
      status: "recorded",
      recordedBy: "staff-1",
    }, {} as never, repository);

    expect(payment).toMatchObject({
      orderId: "order-1",
      channel: "pos",
      method: "cash",
      label: "现金",
      amount: "10.50",
      status: "recorded",
      recordedBy: "staff-1",
    });
    expect(rows).toEqual([payment]);
  });

  it("records a Storefront provider transaction", async () => {
    const { repository } = fakeRepository();
    const payment = await recordOrderPayment({
      orderId: "order-2",
      channel: "storefront",
      method: "paypal",
      label: "PayPal",
      amount: "20.00",
      reference: null,
      providerTransactionId: "PAY-1",
      status: "recorded",
      recordedBy: null,
    }, {} as never, repository);
    expect(payment.providerTransactionId).toBe("PAY-1");
  });

  it.each(["0.00", "-1.00", "1.001"])("rejects invalid payment amount %s", async (amount) => {
    const { repository } = fakeRepository();
    await expect(recordOrderPayment({
      orderId: "order-1",
      channel: "pos",
      method: "cash",
      label: "Cash",
      amount,
      reference: null,
      providerTransactionId: null,
      status: "recorded",
      recordedBy: "staff-1",
    }, {} as never, repository)).rejects.toMatchObject({ code: "PAYMENT_AMOUNT_INVALID" });
  });

  it("rejects an unsupported channel", async () => {
    const { repository } = fakeRepository();
    await expect(recordOrderPayment({
      orderId: "order-1",
      channel: "mobile" as "pos",
      method: "cash",
      label: "Cash",
      amount: "1.00",
      reference: null,
      providerTransactionId: null,
      status: "recorded",
      recordedBy: "staff-1",
    }, {} as never, repository)).rejects.toMatchObject({ code: "PAYMENT_CHANNEL_INVALID" });
  });
});
