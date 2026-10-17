"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, isLocale, LOCALE_LABELS, translateMessage, type Locale } from "./messages";
import { formatDate, formatDuration } from "@/lib/shared/format";

const LOCALE_KEY = "shanliu:locale";

type I18nContextValue = {
  locale: Locale;
  locales: Locale[];
  localeLabel: (locale: Locale) => string;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  statusLabel: (value: string) => string;
  categoryLabel: (value: string) => string;
  evidenceKindLabel: (value: string) => string;
  formatDate: (timestamp: number) => string;
  formatDuration: (seconds: number) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function fromStorage(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = localStorage.getItem(LOCALE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("shanliu:locale", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("shanliu:locale", listener);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, fromStorage, () => DEFAULT_LOCALE);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(LOCALE_KEY, next);
    window.dispatchEvent(new Event("shanliu:locale"));
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      return translateMessage(locale, key, vars);
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      locales: ["en", "zh"],
      localeLabel: (nextLocale) => LOCALE_LABELS[nextLocale],
      setLocale,
      t,
      statusLabel: (status) => t(status),
      categoryLabel: (category) => t(category),
      evidenceKindLabel: (kind) => t(kind),
      formatDate: (timestamp) => formatDate(timestamp, locale === "zh" ? "zh-CN" : "en-SG"),
      formatDuration: (seconds) => formatDuration(seconds, locale),
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
