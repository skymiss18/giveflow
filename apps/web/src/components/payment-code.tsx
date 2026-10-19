"use client";

import { useId, useSyncExternalStore } from "react";
import { Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useI18n } from "@/lib/i18n/context";
import { Alert, Copyable } from "./ui";

const subscribe = () => () => {};
const originSnapshot = () => window.location.origin;
const serverSnapshot = () => "";

export function PaymentCode({ path, label, size = 196 }: { path: string; label: string; size?: number }) {
  const { t } = useI18n();
  const id = useId();
  const origin = useSyncExternalStore(subscribe, originSnapshot, serverSnapshot);
  const url = origin ? new URL(path, process.env.NEXT_PUBLIC_APP_URL || origin).href : "";
  const local = url && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

  function download() {
    const svg = document.getElementById(id);
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = "giveflow-payment-qr.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex shrink-0 items-center justify-center rounded-lg border border-line bg-white p-3" style={{ width: size + 28, height: size + 28 }}>
          {url && <QRCodeSVG id={id} value={url} size={size} marginSize={4} level="M" role="img" aria-label={label} title={label} />}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="text-sm font-medium">{label}</div>
          {url && <div className="max-w-64 break-all"><Copyable value={url} short={url} /></div>}
          <button type="button" disabled={!url} onClick={download} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm hover:bg-mint-soft disabled:opacity-50">
            <Download size={16} aria-hidden="true" />{t("Download QR")}
          </button>
        </div>
      </div>
      {local && <Alert tone="warn">{t("This QR code uses localhost. Open GiveFlow from a public HTTPS address before scanning with a phone.")}</Alert>}
    </div>
  );
}