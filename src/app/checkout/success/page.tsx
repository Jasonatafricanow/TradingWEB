"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Package } from "@phosphor-icons/react";

export default function CheckoutSuccessPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
          <CardTitle className="text-2xl font-bold mt-2">Payment Successful!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-500">
            Your order has been placed and is being processed. You will receive a confirmation email shortly.
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
