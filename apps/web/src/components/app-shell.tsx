"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { DeploymentGuard } from "@/components/deployment-guard";
import { Footer } from "@/components/footer";
import { Header } from "@/components/header";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const standalone = pathname === "/supermarket";

  if (standalone) {
    return (
      <main className="min-h-screen">
        <DeploymentGuard>{children}</DeploymentGuard>
      </main>
    );
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <DeploymentGuard>{children}</DeploymentGuard>
      </main>
      <Footer />
    </>
  );
}