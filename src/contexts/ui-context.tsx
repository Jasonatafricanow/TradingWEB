"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * 全局界面状态：命令面板与迷你购物车抽屉。
 * 快捷键 ⌘K / Ctrl+K 打开命令面板；加购后由调用方打开购物车抽屉。
 */
interface UIContextType {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  openCart: () => void;
}

const UIContext = createContext<UIContextType>({
  commandOpen: false,
  setCommandOpen: () => {},
  cartOpen: false,
  setCartOpen: () => {},
  openCart: () => {},
});

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);

  const openCart = useCallback(() => {
    setCommandOpen(false);
    setCartOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCartOpen(false);
        setCommandOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <UIContext.Provider value={{ commandOpen, setCommandOpen, cartOpen, setCartOpen, openCart }}>
      {children}
    </UIContext.Provider>
  );
}

export function useUI() {
  return useContext(UIContext);
}