"use client";

import Link from "next/link";
import { Droplets } from "lucide-react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { ConnectButton } from "./wallet";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/supermarket", label: "Supermarket" },
  { href: "/projects", label: "Projects" },
  { href: "/orders", label: "My orders" },
  { href: "/merchant", label: "Merchant" },
  { href: "/charity", label: "Charity" },
  { href: "/verifier", label: "Verifier" },
  { href: "/admin", label: "Admin" },
] as const;

export function Header() {
  const pathname = usePathname();
  const { t, locale, locales, setLocale, localeLabel } = useI18n();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 lg:flex-1">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-xl font-semibold">GiveFlow</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1 transition hover:bg-mint-soft ${
                  pathname.startsWith(l.href) ? "bg-mint font-medium" : ""
                }`}
              >
                {t(l.label)}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex max-w-full flex-wrap items-center gap-1 sm:gap-2">
          <div className="grid h-9 shrink-0 grid-cols-[58px_36px] gap-0.5 rounded-lg border border-line/80 bg-ink/5 p-0.5 text-xs sm:grid-cols-[64px_44px]">
            {locales.map((next) => (
              <button
                key={next}
                type="button"
                onClick={() => setLocale(next)}
                className={`rounded-md border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${next === locale ? "border-line/70 bg-paper font-semibold text-ink shadow-sm" : "border-transparent text-ink-soft hover:bg-paper/70"}`}
                aria-pressed={next === locale}
              >
                {localeLabel(next)}
              </button>
            ))}
          </div>
          <ConnectButton />
          <div className="border-l border-line pl-1 sm:pl-2">
            <Link
              href="/faucet"
              aria-label={t("Test token faucet")}
              aria-current={pathname === "/faucet" ? "page" : undefined}
              className={`group relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${pathname === "/faucet" ? "border-ink/20 bg-mint-soft text-ink" : "border-transparent text-ink-soft hover:border-line hover:bg-paper hover:text-ink"}`}
            >
              <Droplets size={17} strokeWidth={1.75} aria-hidden="true" />
              <span aria-hidden="true" className="pointer-events-none absolute right-0 top-full z-30 mt-2 w-max max-w-56 rounded-md bg-ink px-2.5 py-1.5 text-xs text-paper opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                {t("Test token faucet")}
              </span>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
