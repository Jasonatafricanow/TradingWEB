import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  formatOrderCancelConfirmation,
  formatOrderMoney,
  getOrderStatusLabel,
  translate,
} from "@/i18n";

describe("storefront order presentation", () => {
  it("localizes stable statuses in every supported locale", () => {
    const statuses = [
      "pending",
      "paid",
      "processing",
      "shipped",
      "delivering",
      "delivered",
      "delivery_failed",
      "completed",
      "cancelled",
      "refunded",
    ];
    for (const locale of ["zh", "en", "pt"] as const) {
      for (const status of statuses) {
        expect(getOrderStatusLabel(locale, status)).not.toBe(
          translate(locale, "orders.status.unknown"),
        );
      }
    }
    expect(getOrderStatusLabel("zh", "pending")).toBe("待支付");
    expect(getOrderStatusLabel("en", "delivered")).toBe("Delivered");
    expect(getOrderStatusLabel("pt", "refunded")).toBe("Reembolsado");
    expect(getOrderStatusLabel("pt", "future_status")).toBe("Estado desconhecido");
  });

  it("interpolates cancellation confirmation without changing the order number", () => {
    expect(formatOrderCancelConfirmation("pt", "GT-1042")).toBe(
      "Cancelar o pedido GT-1042?",
    );
  });

  it("provides typed page copy and safe failures", () => {
    expect(translate("pt", "orders.title")).toBe("Meus pedidos");
    expect(translate("en", "orders.payment_create_failed")).toBe(
      "Payment could not be started. Please try again.",
    );
  });

  it("formats valid currency and fails safe for dirty imported codes", () => {
    expect(formatOrderMoney("en", 12.5, "usd")).toBe("$12.50");
    expect(formatOrderMoney("pt", 12.5, "???")).toBe(
      "12,50 moeda indisponível",
    );
    expect(formatOrderMoney("zh", 12.5, null)).toBe("12.50 币种不可用");
  });

  it("removes inline two-language and manual locale formatting branches", () => {
    const source = readFileSync("src/app/orders/page.tsx", "utf8");
    expect(source).not.toContain('locale === "zh"');
    expect(source).not.toContain(".toLocaleDateString()");
    expect(source).not.toContain("Number(order.total_amount).toFixed(2)");
  });
});
