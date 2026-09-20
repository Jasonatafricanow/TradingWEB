"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

export interface CartItem {
  id: string;
  title: string;
  price: number;
  type: string;
  quantity: number;
  image_key?: string | null;
  variant_id?: string | null;
  variant_name?: string | null;
  delivery_method?: string | null;
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string, variant_id?: string, delivery_method?: string) => void;
  updateQuantity: (id: string, quantity: number, variant_id?: string, delivery_method?: string) => void;
  clearCart: () => void;
  total: number;
  count: number;
}

const CART_KEY = "tradingweb_cart";

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: () => {},
  removeItem: () => {},
  updateQuantity: () => {},
  clearCart: () => {},
  total: 0,
  count: 0,
});

/** Build a normalized key from raw values (for cart-item CRUD params) */
function computeKey(id: string, variant_id?: string | null, delivery_method?: string | null): string {
  const vid = variant_id ?? "";
  const dm = delivery_method ?? "";
  return vid || dm ? id + "::" + vid + "::" + dm : id;
}

/** Build a normalized key from a CartItem object */
function itemKey(item: CartItem): string {
  return computeKey(item.id, item.variant_id, item.delivery_method);
}

/** Load cart from localStorage, migrating old null-delivery items */
function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem(CART_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        // Migrate: old items may have delivery_method === null/undefined
        // Normalize to "" so itemKey() produces consistent keys
        return parsed.map((item: CartItem) => ({
          ...item,
          delivery_method: item.delivery_method ?? "",
        }));
      }
    }
  } catch {
    // corrupt data — ignore
  }
  return [];
}

/** Save cart to localStorage */
function persistCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  // Lazy-init from localStorage
  const [items, setItems] = useState<CartItem[]>(() => {
    // First mount: try to restore
    if (typeof window !== "undefined") {
      return loadCart();
    }
    return [];
  });

  // Persist to localStorage whenever items change
  useEffect(() => {
    persistCart(items);
  }, [items]);

  const addItem = useCallback((item: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const k = itemKey(item as CartItem);
      const existing = prev.find((i) => itemKey(i) === k);
      if (existing) {
        return prev.map((i) =>
          itemKey(i) === k ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: string, variant_id?: string, delivery_method?: string) => {
    const k = computeKey(id, variant_id, delivery_method);
    setItems((prev) => prev.filter((i) => itemKey(i) !== k));
  }, []);

  const updateQuantity = useCallback((id: string, quantity: number, variant_id?: string, delivery_method?: string) => {
    const k = computeKey(id, variant_id, delivery_method);
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => itemKey(i) !== k));
      return;
    }
    setItems((prev) =>
      prev.map((i) =>
        itemKey(i) === k ? { ...i, quantity } : i
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    if (typeof window !== "undefined") {
      localStorage.removeItem(CART_KEY);
    }
  }, []);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, count }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
