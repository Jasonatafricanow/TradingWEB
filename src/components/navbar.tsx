"use client";

import { useTheme } from "@/contexts/theme-context";
import { TechNavbar } from "./navbar-themes/tech-navbar";
import { ShopifyNavbar } from "./navbar-themes/shopify-navbar";

export function Navbar() {
  const { theme } = useTheme();
  return theme === "shopify" ? <ShopifyNavbar /> : <TechNavbar />;
}
