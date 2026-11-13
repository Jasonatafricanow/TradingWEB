"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

interface ThemeContextProps {
  theme: string;
}

const ThemeContext = createContext<ThemeContextProps | undefined>(undefined);

export function ThemeProvider({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme: string;
}) {
  // 预览覆盖仅在客户端读取 URL，避免静态预渲染依赖 searchParams
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const read = () => setPreview(new URLSearchParams(window.location.search).get("theme"));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const effective =
    preview === "tech" || preview === "shopify" ? preview : theme;

  // 预览覆盖时同步 body 主题类，保证令牌与组件一致
  useEffect(() => {
    document.body.classList.toggle("theme-tech", effective === "tech");
    document.body.classList.toggle("theme-shopify", effective !== "tech");
  }, [effective]);

  return (
    <ThemeContext.Provider value={{ theme: effective }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
