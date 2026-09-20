"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/contexts/cart-context";
import { useCurrency } from "@/contexts/currency-context";
import { useI18n } from "@/contexts/i18n-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShoppingCart, Trash, Minus, Plus, ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { BreadcrumbPublic } from "@/components/breadcrumb-public";

export default function CartPage() {
  const { items, removeItem, updateQuantity, total, count, clearCart } = useCart();
  const { format: formatPrice } = useCurrency();
  const { t } = useI18n();
  const router = useRouter();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <ShoppingCart className="mx-auto h-16 w-16 text-gray-300" />
        <h2 className="mt-6 text-2xl font-bold text-gray-900">{t("cart.empty")}</h2>
        <p className="mt-2 text-gray-500">{t("nav.products")}</p>
        <Button className="mt-6" onClick={() => router.push("/products")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("nav.products")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <BreadcrumbPublic items={[{ label: t("crumb.cart") }]} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("cart.title")} ({count} {t("cart.quantity")})
        </h1>
        <Button variant="ghost" size="sm" onClick={clearCart}>
          <Trash className="mr-1 h-4 w-4" />
          {t("cart.remove")}
        </Button>
      </div>

      <div className="space-y-4">
        {items.map((item) => {
          const itemKey = [item.id, item.variant_id || "", (item as any).delivery_method || ""]
            .filter(Boolean)
            .join("::") || item.id;
          return (
            <Card key={itemKey}>
              <CardContent className="flex items-center gap-4 p-4">
                {/* Product image placeholder */}
                <div className="h-20 w-20 flex-shrink-0 rounded-lg bg-gray-100 flex items-center justify-center">
                  <ShoppingCart className="h-8 w-8 text-gray-300" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{item.title}</h3>
                  {item.variant_name && (
                    <p className="text-xs text-gray-500 mt-1">{item.variant_name}</p>
                  )}
                  <p className="text-lg font-bold text-gray-900 mt-1">
                    {formatPrice(item.price)}
                  </p>
                </div>

                {/* Quantity controls */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.id, item.quantity - 1, item.variant_id || undefined, (item as any).delivery_method || undefined)}
                  >
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-8 text-center font-semibold text-sm">{item.quantity}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => updateQuantity(item.id, item.quantity + 1, item.variant_id || undefined, (item as any).delivery_method || undefined)}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {/* Subtotal & remove */}
                <div className="flex flex-col items-end gap-2">
                  <p className="font-bold text-gray-900">
                    {formatPrice(item.price * item.quantity)}
                  </p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-red-500 hover:text-red-700"
                    onClick={() => removeItem(item.id, item.variant_id || undefined, (item as any).delivery_method || undefined)}
                  >
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Separator className="my-6" />

      {/* Summary */}
      <div className="flex flex-col items-end gap-4">
        <div className="text-right">
          <p className="text-sm text-gray-500">
            {t("cart.total")} ({count})
          </p>
          <p className="text-3xl font-bold text-gray-900">{formatPrice(total)}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.push("/products")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("nav.products")}
          </Button>
          <Button className="bg-blue-600 text-white hover:bg-blue-700 transition-colors" onClick={() => router.push("/checkout")}>
            {t("cart.checkout")}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
