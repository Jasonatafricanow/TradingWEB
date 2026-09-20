"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface BreadcrumbCtx {
  override: string | null;
  setOverride: (label: string | null) => void;
}

const BreadcrumbCtx = createContext<BreadcrumbCtx>({
  override: null,
  setOverride: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [override, setOverride] = useState<string | null>(null);
  return (
    <BreadcrumbCtx.Provider value={{ override, setOverride }}>
      {children}
    </BreadcrumbCtx.Provider>
  );
}

export function useBreadcrumbOverride(label: string | null) {
  const { setOverride } = useContext(BreadcrumbCtx);
  useEffect(() => {
    setOverride(label);
    return () => setOverride(null);
  }, [label, setOverride]);
}

export function useBreadcrumbValue() {
  return useContext(BreadcrumbCtx);
}
