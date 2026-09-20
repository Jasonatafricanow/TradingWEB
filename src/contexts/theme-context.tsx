"use client";

import React, { createContext, useContext } from "react";

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
  return (
    <ThemeContext.Provider value={{ theme }}>
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
