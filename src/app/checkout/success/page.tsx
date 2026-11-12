"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Package } from "@phosphor-icons/react";

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get("order_id");
    if (!id) { setStatus("unknown"); return; }
    apiFetch(`/api/orders/${encodeURIComponent(id)}`).then(async response => {
      if (!response.ok) throw new Error("Order unavailable");
      const json = await response.json();
      if (active) setStatus(json.data?.payment_status === "paid" ? "paid" : "pending");
    }).catch(() => { if (active) setStatus("unknown"); });
    return () => { active = false; };
  }, []);
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
          <CardTitle className="text-2xl font-bold mt-2">{status === "paid" ? "Payment confirmed" : status === "loading" ? "Checking payment…" : status === "pending" ? "Awaiting payment" : "Check your order status"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-500">
            {status === "paid" ? "Your payment has been confirmed." : "Open your orders to review the latest payment and fulfillment status."}
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
