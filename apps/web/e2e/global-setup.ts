import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const RPC = "http://127.0.0.1:8546";
// Anvil's first built-in dev account; public and worthless outside a local chain.
const DEPLOYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const root = resolve(__dirname, "../../..");
const bin = (name: string) => {
  const local = join(homedir(), ".foundry", "bin", process.platform === "win32" ? `${name}.exe` : name);
  return existsSync(local) ? local : name;
};

async function waitForRpc() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(RPC, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      });
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Anvil did not start on port 8546");
}

export default async function globalSetup() {
  const deployment = join(root, "contracts", "deployments", "31337.json");
  const generated = join(root, "apps", "web", "src", "contracts", "deployments.ts");
  const backup = join(root, "apps", "web", ".e2e-backup");
  mkdirSync(backup, { recursive: true });
  const hadDeployment = existsSync(deployment);
  if (hadDeployment) copyFileSync(deployment, join(backup, "31337.json"));
  copyFileSync(generated, join(backup, "deployments.ts"));

  rmSync(join(root, "apps", "web", ".e2e-data"), { recursive: true, force: true });

  const anvil: ChildProcess = spawn(bin("anvil"), ["--port", "8546", "--chain-id", "31337"], { stdio: "ignore" });

  const restore = () => {
    anvil.kill();
    if (hadDeployment) copyFileSync(join(backup, "31337.json"), deployment);
    copyFileSync(join(backup, "deployments.ts"), generated);
    rmSync(backup, { recursive: true, force: true });
  };

  try {
    await waitForRpc();

    // A DEPLOYER_PRIVATE_KEY in contracts/.env (for Sepolia) must not leak into the local run.
    execFileSync(
      bin("forge"),
      ["script", "script/Deploy.s.sol", "--rpc-url", RPC, "--broadcast"],
      { cwd: join(root, "contracts"), stdio: "ignore", env: { ...process.env, DEPLOYER_PRIVATE_KEY: DEPLOYER_KEY } },
    );
    execFileSync("node", ["scripts/sync-abi.mjs"], { cwd: root, stdio: "ignore" });
  } catch (e) {
    restore();
    throw e;
  }

  return async () => restore();
}
