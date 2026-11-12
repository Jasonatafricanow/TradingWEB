"use client";

import { useEffect, useState } from "react";
import { clearCheckoutAttempt } from "@/lib/checkout-attempt";
import { apiFetch } from "@/lib/client-api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Package } from "@phosphor-icons/react";
import { useI18n } from "@/contexts/i18n-context";

const PAYMENT_STATE = { loading: "loading", paid: "paid", pending: "pending", unknown: "unknown" } as const;
type PaymentState = (typeof PAYMENT_STATE)[keyof typeof PAYMENT_STATE];
const TITLE_KEYS = {
  paid: "checkout_result.title_paid",
  loading: "checkout_result.title_checking",
  pending: "checkout_result.title_pending",
  unknown: "checkout_result.title_unknown",
} as const satisfies Record<PaymentState, string>;

export default function CheckoutSuccessPage() {
  const { t } = useI18n();
  // Payment state codes, not display text.
  const [status, setPaymentState] = useState<PaymentState>(PAYMENT_STATE.loading);
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get("order_id");
    if (!id) { setPaymentState(PAYMENT_STATE.unknown); return; }
    // The order exists now; a new checkout in this tab must get a new key.
    clearCheckoutAttempt();
    apiFetch(`/api/orders/${encodeURIComponent(id)}`).then(async response => {
      if (!response.ok) throw new Error("Order unavailable");
      const json = await response.json();
      if (active) setPaymentState(json.data?.payment_status === PAYMENT_STATE.paid ? PAYMENT_STATE.paid : PAYMENT_STATE.pending);
    }).catch(() => { if (active) setPaymentState(PAYMENT_STATE.unknown); });
    return () => { active = false; };
  }, []);
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
          <CardTitle className="text-2xl font-bold mt-2">{t(TITLE_KEYS[status])}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-500">
            {t(status === PAYMENT_STATE.paid ? "checkout_result.body_paid" : "checkout_result.body_other")}
          </p>
          <div className="flex flex-col gap-3">
            <Link href="/orders">
              <Button className="w-full" variant="outline">
                <Package className="mr-2 h-4 w-4" />
                View My Orders
              </Button>
            </Link>
            <Link href="/products">
              <Button className="w-full bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
