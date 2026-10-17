import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    ...(process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_CHAIN_ID === "31337" && process.env.GIVEFLOW_E2E_WALLET === "1" ? {
      resolveAlias: { "@walletconnect/ethereum-provider": "./e2e/customer-wallet.ts" },
    } : {}),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
