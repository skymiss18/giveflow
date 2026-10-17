"use client";

import { useI18n } from "@/lib/i18n/context";

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 pb-10 text-xs text-ink-soft">
      <span>{t("Chain proves, files stay private: only content hashes go on-chain. Demo software — test tokens only.")}</span>
    </footer>
  );
}
