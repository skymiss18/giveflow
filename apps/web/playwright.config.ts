import { defineConfig } from "@playwright/test";

// Runs against a fresh local Anvil chain with a dedicated Next server (separate port, build dir and data dir).
const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    command: `pnpm exec next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      NEXT_PUBLIC_CHAIN_ID: "31337",
      NEXT_PUBLIC_RPC_URL: "http://127.0.0.1:8546",
      RPC_URL: "http://127.0.0.1:8546",
      NEXT_PUBLIC_DEV_WALLETS: "1",
      GIVEFLOW_E2E_WALLET: "1",
      NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: "giveflow-local-e2e",
      RELAY_ALLOWED_TOKENS: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      RELAY_ALLOWED_CAMPAIGNS: "1",
      RELAYER_PRIVATE_KEY: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      DATA_DIR: ".e2e-data",
      NEXT_DIST_DIR: ".next-e2e",
    },
  },
});
