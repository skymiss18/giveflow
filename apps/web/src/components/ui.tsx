"use client";

import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useI18n } from "@/lib/i18n/context";
import { CHAIN_ID } from "@/lib/shared/chain";
import { explorerBase, shortAddress, shortHash } from "@/lib/shared/format";
import type { TxState } from "@/lib/client/hooks";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 max-w-2xl text-ink-soft">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-line bg-paper p-5 shadow-sm", className)}>{children}</div>;
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-baseline justify-between gap-4 first:mt-0">
      <h2 className="text-lg font-semibold">{children}</h2>
      {hint && <span className="text-sm text-ink-soft">{hint}</span>}
    </div>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" };

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  const styles = {
    primary: "bg-ink text-cream hover:bg-ink-soft",
    secondary: "border border-ink/25 bg-paper text-ink hover:bg-mint-soft",
    ghost: "text-ink hover:bg-mint-soft",
    danger: "bg-coral text-white hover:bg-coral-dark",
  }[variant];
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        className,
      )}
    />
  );
}

const TONES = {
  neutral: "bg-ink/10 text-ink",
  good: "bg-mint text-ink",
  warn: "bg-gold/70 text-ink",
  bad: "bg-coral/20 text-coral-dark",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cx("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", TONES[tone])}>{children}</span>;
}

export function statusTone(status: string): keyof typeof TONES {
  if (["Approved", "Active", "Settled", "Verified", "Completed"].includes(status)) return "good";
  if (["Pending", "Escrowed", "Submitted", "Paused"].includes(status)) return "warn";
  if (["Rejected", "Suspended", "Refunded", "Closed", "Superseded"].includes(status)) return "bad";
  return "neutral";
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-mint";

export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, p.className)} />;
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea rows={3} {...p} className={cx(inputCls, p.className)} />
);
export const Select = (p: SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(inputCls, p.className)} />;

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-ink-soft">{sub}</div>}
    </div>
  );
}

export function Alert({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  const border = { neutral: "border-line", good: "border-mint", warn: "border-gold", bad: "border-coral/50" }[tone];
  return <div className={cx("rounded-xl border bg-paper px-4 py-3 text-sm", border)}>{children}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
      <div className="font-medium">{title}</div>
      {children && <div className="mt-1 text-sm text-ink-soft">{children}</div>}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return <div className="py-10 text-center text-sm text-ink-soft">{label ?? t("Loading…")}</div>;
}

export function ErrorNote({ error }: { error: unknown }) {
  const { t } = useI18n();
  return <Alert tone="bad">{t(error instanceof Error ? error.message : String(error))}</Alert>;
}

export function Copyable({ value, short }: { value: string; short?: string }) {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={value}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      }}
      className="font-mono text-xs underline decoration-dotted underline-offset-2 hover:text-coral-dark"
    >
      {done ? t("copied") : (short ?? value)}
    </button>
  );
}

export const AddressText = ({ value }: { value: string }) => <Copyable value={value} short={shortAddress(value)} />;
export const HashText = ({ value }: { value: string }) => <Copyable value={value} short={shortHash(value)} />;

export function TxLink({ hash, label }: { hash: string | null; label?: string }) {
  if (!hash) return null;
  const base = explorerBase(CHAIN_ID);
  if (!base) return <HashText value={hash} />;
  return (
    <a href={`${base}/tx/${hash}`} target="_blank" rel="noreferrer" className="font-mono text-xs underline underline-offset-2 hover:text-coral-dark">
      {label ?? shortHash(hash)} ↗
    </a>
  );
}

export function AddressLink({ address }: { address: string }) {
  const base = explorerBase(CHAIN_ID);
  if (!base) return <AddressText value={address} />;
  return (
    <a href={`${base}/address/${address}`} target="_blank" rel="noreferrer" className="font-mono text-xs underline underline-offset-2 hover:text-coral-dark">
      {shortAddress(address)} ↗
    </a>
  );
}

export function TxStatus({ tx }: { tx: Pick<TxState, "status" | "hash" | "error"> }) {
  const { t } = useI18n();
  if (tx.status === "idle") return null;
  if (tx.status === "signing") return <Alert>{t("Confirm the transaction in your wallet…")}</Alert>;
  if (tx.status === "pending") {
    return (
      <Alert tone="warn">
        {t("Waiting for confirmation…")} {tx.hash && <TxLink hash={tx.hash} />}
      </Alert>
    );
  }
  if (tx.status === "success") {
    return (
      <Alert tone="good">
        {t("Confirmed on-chain.")} {tx.hash && <TxLink hash={tx.hash} />}
      </Alert>
    );
  }
  return <Alert tone="bad">{tx.error} {tx.hash && <TxLink hash={tx.hash} />}</Alert>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (tab: T) => void }) {
  const { t } = useI18n();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={cx(
            "rounded-full px-4 py-1.5 text-sm font-medium transition",
            tab === value ? "bg-ink text-cream" : "border border-line bg-paper hover:bg-mint-soft",
          )}
        >
          {t(tab)}
        </button>
      ))}
    </div>
  );
}
