"use client";

import { useTheme } from "@/contexts/theme-context";
import { TechHome } from "./home-themes/tech-home";
import { ShopifyHome } from "./home-themes/shopify-home";

export default function HomePage() {
  const { theme } = useTheme();
  return theme === "shopify" ? <ShopifyHome /> : <TechHome />;
}
