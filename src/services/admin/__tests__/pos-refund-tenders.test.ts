import { describe, expect, it } from "vitest";

import { allocateRefundTenders, cashOutsideShift, type RefundTenderBasis } from "../pos-refund-tenders";
import { sumUnambiguousCashRefunds } from "../pos-shift-service";

const basis = (paid: Array<[string, number]>, refunded: Array<[string, number]> = [], legacyMethod: string | null = "split"): RefundTenderBasis => ({
  paid: paid.map(([method, amountCents]) => ({ method, label: method, amountCents })),
  refundedByMethod: new Map(refunded),
  legacyMethod,
});
const total = (tenders: Array<{ amount: string }>) => tenders.reduce((sum, t) => sum + Math.round(Number(t.amount) * 100), 0);

describe("POS refund tenders", () => {
  it("returns a split cash + card sale in proportion: 60/40 sale, refund 50 -> 30 cash, 20 card", () => {
    expect(allocateRefundTenders(5000, basis([["cash", 6000], ["card", 4000]]))).toEqual([
      { method: "cash", label: "cash", amount: "30.00" },
      { method: "card", label: "card", amount: "20.00" },
    ]);
  });

  it("never refunds a tender beyond what it has left after earlier refunds", () => {
    const tenders = allocateRefundTenders(3000, basis([["cash", 6000], ["card", 4000]], [["card", 4000]]));
    expect(tenders).toEqual([{ method: "cash", label: "cash", amount: "30.00" }]);
  });

  it("keeps cents exact with three tenders", () => {
    const tenders = allocateRefundTenders(1000, basis([["cash", 3333], ["card", 3333], ["voucher", 3334]]));
    expect(total(tenders)).toBe(1000);
    expect(tenders.every((t) => Number(t.amount) >= 3.33)).toBe(true);
  });

  it("falls back to the order's single method when the sale has no tender rows", () => {
    expect(allocateRefundTenders(1250, basis([], [], "card"))).toEqual([{ method: "card", label: "card", amount: "12.50" }]);
  });

  it("returns cash for value no real tender can absorb (replacement paid by exchange credit)", () => {
    expect(allocateRefundTenders(500, basis([]))).toEqual([{ method: "cash", label: "cash", amount: "5.00" }]);
    expect(total(allocateRefundTenders(900, basis([["card", 400]])))).toBe(900);
  });

  it("flags cash outside a shift only when cash actually moves", () => {
    expect(cashOutsideShift(null, 100)).toBe(true);
    expect(cashOutsideShift(null, 0)).toBe(false);
    expect(cashOutsideShift("shift-1", 100)).toBe(false);
  });

  it("counts recorded cash tenders at shift close, including exchange surpluses and split sales", () => {
    expect(sumUnambiguousCashRefunds([
      { amount: "50.00", orderPaymentMethod: "split", hasTenders: true, tenderCash: "30.00" },
      { amount: "80.00", orderPaymentMethod: "cash", isExchangeAccounting: true, hasTenders: true, tenderCash: "15.00" },
      { amount: "20.00", orderPaymentMethod: "cash" },                       // legacy cash refund
      { amount: "40.00", orderPaymentMethod: "cash", isExchangeAccounting: true }, // legacy exchange: no cash
      { amount: "10.00", orderPaymentMethod: "split" },                      // legacy split: unknown, not counted
    ])).toBe(6500);
  });
});
