import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DeploymentGuard } from "@/components/deployment-guard";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiveFlow",
  description: "Shop online or pay in store with stablecoins. Every purchase supports a verifiable donation.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-10">
            <DeploymentGuard>{children}</DeploymentGuard>
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
