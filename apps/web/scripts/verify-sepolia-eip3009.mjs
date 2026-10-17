import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, keccak256, parseSignature, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

function readEnv(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const root = new URL("../../../", import.meta.url);
const deployment = JSON.parse(readFileSync(new URL("contracts/deployments/11155111.json", root), "utf8"));
const settings = {
  ...readEnv(new URL("contracts/.env", root)),
  ...readEnv(new URL("apps/web/.env.local", root)),
};
const account = privateKeyToAccount(settings.RELAYER_PRIVATE_KEY);
const buyer = privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`);
const client = createPublicClient({ chain: sepolia, transport: http(settings.SEPOLIA_RPC_URL) });
const wallet = createWalletClient({ account, chain: sepolia, transport: http(settings.SEPOLIA_RPC_URL) });
const tokenAbi = [
  { type: "function", name: "faucet", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
  { type: "function", name: "receiveWithAuthorization", stateMutability: "nonpayable", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }, { name: "v", type: "uint8" }, { name: "r", type: "bytes32" }, { name: "s", type: "bytes32" }], outputs: [] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "version", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];
const token = { address: deployment.MockUSDC, abi: tokenAbi };
const amount = 1_000_000n;

try {
  const faucetHash = await wallet.writeContract({ ...token, functionName: "faucet", args: [buyer.address, amount] });
  await client.waitForTransactionReceipt({ hash: faucetHash });
  const [name, version] = await Promise.all([
    client.readContract({ ...token, functionName: "name" }),
    client.readContract({ ...token, functionName: "version" }),
  ]);
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = keccak256(toHex(randomBytes(32)));
  const authorization = {
    from: buyer.address,
    to: account.address,
    value: amount,
    validAfter: 0n,
    validBefore,
    nonce,
  };
  const signature = await buyer.signTypedData({
    domain: { name, version, chainId: 11155111, verifyingContract: deployment.MockUSDC },
    types: {
      ReceiveWithAuthorization: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" },
        { name: "validBefore", type: "uint256" },
        { name: "nonce", type: "bytes32" },
      ],
    },
    primaryType: "ReceiveWithAuthorization",
    message: authorization,
  });
  const { v, r, s } = parseSignature(signature);
  const request = {
    ...token,
    functionName: "receiveWithAuthorization",
    args: [buyer.address, account.address, amount, 0n, validBefore, nonce, Number(v), r, s],
  };
  await client.simulateContract({ ...request, account });
  const authorizationHash = await wallet.writeContract(request);
  await client.waitForTransactionReceipt({ hash: authorizationHash });
  const [buyerBalance, relayerBalance] = await Promise.all([
    client.readContract({ ...token, functionName: "balanceOf", args: [buyer.address] }),
    client.readContract({ ...token, functionName: "balanceOf", args: [account.address] }),
  ]);
  if (buyerBalance !== 0n || relayerBalance < amount) throw new Error("Balance assertion failed");
  console.log(JSON.stringify({
    chainId: 11155111,
    buyer: buyer.address,
    token: deployment.MockUSDC,
    tokenName: name,
    domainVersion: version,
    amount: amount.toString(),
    faucetHash,
    authorizationHash,
    buyerBalance: buyerBalance.toString(),
    recipientBalance: relayerBalance.toString(),
  }, null, 2));
} catch (error) {
  console.error(`EIP-3009 probe failed (${error instanceof Error ? error.name : "unknown error"})`);
  process.exitCode = 1;
}
