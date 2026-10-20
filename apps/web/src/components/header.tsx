"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Building2, ChevronDown, Droplets, LayoutDashboard, QrCode, ShieldCheck, Store, UserCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n/context";
import { ConnectButton } from "./wallet";

const LINKS = [
  { href: "/shop", label: "Shop" },
  { href: "/projects", label: "Projects" },
  { href: "/orders", label: "My orders" },
] as const;

const WORKSPACE_GROUPS = [
  {
    label: "Operations",
    links: [
      { href: "/merchant", label: "Merchant workspace", icon: Store },
      { href: "/charity", label: "Charity workspace", icon: Building2 },
    ],
  },
  {
    label: "Oversight",
    links: [
      { href: "/verifier", label: "Verification", icon: UserCheck },
      { href: "/admin", label: "Platform admin", icon: ShieldCheck },
    ],
  },
] as const;

export function Header() {
  const pathname = usePathname();
  const { t, locale, locales, setLocale, localeLabel } = useI18n();
  const workspaceRef = useRef<HTMLDetailsElement>(null);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const workspaceActive = WORKSPACE_GROUPS.some((group) => group.links.some((link) => isActive(link.href)));
  const navClass = (active: boolean) => `flex min-h-9 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${active ? "bg-mint font-medium" : "text-ink-soft hover:bg-mint-soft hover:text-ink"}`;

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !workspaceRef.current?.contains(event.target)) {
        workspaceRef.current?.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-cream/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="order-1 flex shrink-0 items-baseline gap-2 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <span className="text-xl font-semibold">GiveFlow</span>
          </Link>
          <nav aria-label={t("Main navigation")} className="relative order-3 flex w-full flex-wrap items-center gap-x-3 gap-y-2 text-sm xl:order-2 xl:w-auto xl:flex-1 xl:flex-nowrap xl:gap-x-1">
            <div className="flex flex-wrap items-center gap-1 xl:flex-nowrap">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={isActive(l.href) ? "page" : undefined}
                className={navClass(isActive(l.href))}
              >
                {t(l.label)}
              </Link>
            ))}
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-1 sm:border-l sm:border-line sm:pl-3">
              <Link href="/supermarket" target="_blank" rel="noopener noreferrer" aria-current={isActive("/supermarket") ? "page" : undefined} className={`${navClass(isActive("/supermarket"))} xl:px-2`}>
                <QrCode size={16} aria-hidden="true" />
                {t("In-store")}
              </Link>
              <details
                key={pathname}
                ref={workspaceRef}
                className="group sm:relative"
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector("summary")?.focus();
                  }
                }}
              >
                <summary className={`${navClass(workspaceActive)} cursor-pointer list-none [&::-webkit-details-marker]:hidden xl:px-2`}>
                  <LayoutDashboard size={16} aria-hidden="true" />
                  {t("Workspaces")}
                  <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="absolute right-0 top-full z-30 mt-2 w-56 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-paper p-2 shadow-lg">
                  {WORKSPACE_GROUPS.map((group, index) => (
                    <div key={group.label} className={index ? "mt-2 border-t border-line pt-2" : ""}>
                      <p className="px-3 py-2 text-xs font-medium text-ink-soft">{t(group.label)}</p>
                      {group.links.map(({ href, label, icon: Icon }) => (
                        <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={navClass(isActive(href))} onClick={() => workspaceRef.current?.removeAttribute("open")}>
                          <Icon size={17} aria-hidden="true" />
                          {t(label)}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </nav>

        <div className="order-2 ml-auto flex max-w-full flex-wrap items-center gap-1 sm:gap-2 xl:order-3">
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
              title={t("Test token faucet")}
              className={`flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${pathname === "/faucet" ? "border-ink/20 bg-mint-soft font-medium text-ink" : "border-transparent text-ink-soft hover:border-line hover:bg-paper hover:text-ink"}`}
            >
              <Droplets size={17} strokeWidth={1.75} aria-hidden="true" />
              {t("Faucet")}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
