"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  type CurrencyCode,
  CURRENCIES,
  DEFAULT_CURRENCY,
  getStoredCurrencyOrNull,
  setStoredCurrency,
  DEFAULT_RATES,
  convertPrice,
  formatPrice,
  isCurrencyCode,
  normalizeCurrencyRates,
} from "@/config/currency";

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (code: CurrencyCode) => void;
  /** Convert a USD amount to the active currency */
  convert: (usdAmount: number) => number;
  /** Format a USD amount in the active currency */
  format: (usdAmount: number) => string;
  /** Get the symbol for the active currency */
  symbol: string;
  /** Get all available currencies */
  currencies: typeof CURRENCIES;
}

const CurrencyContext = createContext<CurrencyContextType>({
  currency: DEFAULT_CURRENCY,
  setCurrency: () => {},
  convert: (n) => n,
  format: (n) => `$${n.toFixed(2)}`,
  symbol: "$",
  currencies: CURRENCIES,
});

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [rates, setRates] = useState<Record<CurrencyCode, number>>(DEFAULT_RATES);

  // Load currency choice: manual localStorage preference wins; otherwise detect from request IP.
  useEffect(() => {
    let cancelled = false;
    const stored = getStoredCurrencyOrNull();
    if (stored) {
      setCurrencyState(stored);
      return;
    }

    fetch("/api/currency/detect")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || getStoredCurrencyOrNull()) return;
        const detected = json?.data?.currency;
        if (isCurrencyCode(detected)) {
          setCurrencyState(detected);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Load cached daily rates. Fail closed to DEFAULT_RATES so pricing display never breaks.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/currency/rates")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (cancelled || !json?.data?.rates) return;
        setRates(normalizeCurrencyRates(json.data.rates));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const setCurrency = useCallback((code: CurrencyCode) => {
    setCurrencyState(code);
    setStoredCurrency(code);
  }, []);

  const rate = rates[currency] || DEFAULT_RATES[currency] || 1;
  const info = CURRENCIES.find((c) => c.code === currency);

  const value = {
    currency,
    setCurrency,
    convert: (usdAmount: number) => convertPrice(usdAmount, rate),
    format: (usdAmount: number) => formatPrice(convertPrice(usdAmount, rate), currency),
    symbol: info?.symbol || "$",
    currencies: CURRENCIES,
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

export const useCurrency = () => useContext(CurrencyContext);
