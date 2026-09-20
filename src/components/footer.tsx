"use client";

import { useTheme } from "@/contexts/theme-context";
import { TechFooter } from "./footer-themes/tech-footer";
import { ShopifyFooter } from "./footer-themes/shopify-footer";

export function Footer() {
  const { theme } = useTheme();
  return theme === "shopify" ? <ShopifyFooter /> : <TechFooter />;
}
