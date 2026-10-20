// Seeds the pilot scenario on the configured chain. Needs the web app running (APP_URL, default http://localhost:3000).
// Local Anvil: uses its unlocked dev accounts. Sepolia: generates throwaway role wallets, funds them from the deployer, and stores
// their keys in apps/web/.data/demo-wallets.json so you can import them into a wallet.
// Usage: CHAIN_ID=11155111 pnpm --filter web seed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, http, keccak256, parseEther, parseEventLogs, parseUnits, toBytes } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { foundry, sepolia } from "viem/chains";
import * as abis from "../src/contracts/abis.ts";
import { authMessage } from "../src/lib/shared/auth.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "../../..");
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 31337);
const LOCAL = CHAIN_ID === 31337;
const APP = process.env.APP_URL ?? "http://localhost:3000";
const dep = JSON.parse(readFileSync(join(repo, "contracts/deployments", `${CHAIN_ID}.json`), "utf8"));

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

const webEnv = readEnvFile(join(here, "../.env.local"));
const RPC = process.env.RPC_URL || webEnv.NEXT_PUBLIC_RPC_URL || (LOCAL ? "http://127.0.0.1:8545" : undefined);
if (!RPC) throw new Error("Set RPC_URL or NEXT_PUBLIC_RPC_URL");

const pub = createPublicClient({ chain: LOCAL ? foundry : sepolia, transport: http(RPC) });
const wallet = createWalletClient({ chain: LOCAL ? foundry : sepolia, transport: http(RPC) });
const usdc = (n) => parseUnits(String(n), 6);

const ANVIL = {
  admin: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  merchant: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  payout: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  charity: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  verifier: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  buyer: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  signer1: "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  signer2: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
  signer3: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f",
  buyer2: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720",
};

const ROLES = Object.keys(ANVIL);

/** role -> { address, account } where account is either an address (node-signed) or a local key account. */
function loadRoles() {
  if (LOCAL) return Object.fromEntries(ROLES.map((r) => [r, { address: ANVIL[r], account: ANVIL[r] }]));

  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY || readEnvFile(join(repo, "contracts/.env")).DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY is needed (contracts/.env)");
  const admin = privateKeyToAccount(deployerKey);
  if (admin.address.toLowerCase() !== dep.admin.toLowerCase()) throw new Error("DEPLOYER_PRIVATE_KEY is not the deployment admin");

  const file = join(here, "../.data/demo-wallets.json");
  const keys = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  for (const r of ROLES) if (r !== "admin" && !keys[r]) keys[r] = generatePrivateKey();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ note: "Throwaway Sepolia demo wallets. Never reuse for real funds.", ...keys }, null, 2));

  return Object.fromEntries(
    ROLES.map((r) => {
      const account = r === "admin" ? admin : privateKeyToAccount(keys[r]);
      return [r, { address: account.address, account }];
    }),
  );
}

const R = loadRoles();

const c = {
  usdc: { address: dep.MockUSDC, abi: abis.mockUSDCAbi },
  merchants: { address: dep.MerchantRegistry, abi: abis.merchantRegistryAbi },
  charities: { address: dep.CharityRegistry, abi: abis.charityRegistryAbi },
  campaigns: { address: dep.ProductCampaign, abi: abis.productCampaignAbi },
  router: { address: dep.CheckoutRouter, abi: abis.checkoutRouterAbi },
  evidence: { address: dep.EvidenceRegistry, abi: abis.evidenceRegistryAbi },
  reports: { address: dep.ImpactReportRegistry, abi: abis.impactReportRegistryAbi },
  factory: { address: dep.TreasuryFactory, abi: abis.treasuryFactoryAbi },
};

async function send(role, request) {
  const hash = await wallet.writeContract({ ...request, account: role.account });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${request.functionName} reverted (${hash})`);
  return receipt;
}

async function postMetadata(kind, data) {
  const res = await fetch(`${APP}/api/metadata`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind, data }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`metadata ${kind}: ${body.error}`);
  return body.hash;
}

async function authHeaders(role, action) {
  const issued = Math.floor(Date.now() / 1000);
  const signature = await wallet.signMessage({
    account: role.account,
    message: authMessage(action, role.address, issued, CHAIN_ID),
  });
  return { "x-auth-address": role.address, "x-auth-issued": String(issued), "x-auth-signature": signature };
}

async function fundWallets() {
  if (LOCAL) return;
  const needed = ["merchant", "charity", "verifier", "buyer", "buyer2", "signer1", "signer2"];
  const min = parseEther("0.0003");
  for (const r of needed) {
    if ((await pub.getBalance({ address: R[r].address })) >= min) continue;
    const hash = await wallet.sendTransaction({ account: R.admin.account, to: R[r].address, value: parseEther("0.0005") });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  funded ${r} ${R[r].address}`);
  }
}

async function seedMoreCauses(step) {
  const count = await pub.readContract({ ...c.charities, functionName: "projectCount" });
  if (count >= 3n) return;

  const causes = [
    {
      project: {
        title: "Hot meals for elderly neighbours",
        summary: "Prepare and deliver nutritious meals to seniors living alone. Recipients are never named; only meal counts are reported.",
        category: "Elderly care",
        location: "Singapore",
        usage: "Ingredients, kitchen volunteer stipends and delivery costs. Each week's meal count is backed by delivery logs.",
      },
      goal: 3000,
      product: {
        slug: "reusable-tote",
        meta: { name: "Reusable Tote Bag", description: "A sturdy cotton tote. 5% of the price funds hot meals for elderly neighbours." },
        price: 12,
        percentBps: 500,
      },
      orders: 3,
    },
    {
      project: {
        title: "Emergency supplies after floods",
        summary: "Pre-position water, blankets and first-aid kits so families affected by flooding get help within hours.",
        category: "Disaster relief",
        location: "Southeast Asia",
        usage: "Purchase and storage of emergency supplies, plus last-mile transport during a response.",
      },
      goal: 8000,
      product: {
        slug: "coffee-beans",
        meta: { name: "Community Coffee Beans (250g)", description: "Single-origin beans. 2 mUSDC from every bag goes to flood emergency supplies." },
        price: 15,
        fixed: 2,
      },
      orders: 2,
    },
  ];

  for (const cause of causes) {
    step(`Cause: ${cause.project.title}`);
    const created = await send(R.charity, {
      ...c.factory,
      functionName: "createTreasury",
      args: [[R.signer1.address, R.signer2.address, R.signer3.address], 2n],
    });
    const treasury = parseEventLogs({ abi: abis.treasuryFactoryAbi, logs: created.logs, eventName: "TreasuryCreated" })[0].args.treasury;
    const projectMeta = await postMetadata("project", cause.project);
    const receipt = await send(R.charity, { ...c.charities, functionName: "createProject", args: [treasury, projectMeta, usdc(cause.goal)] });
    const projectId = parseEventLogs({ abi: abis.charityRegistryAbi, logs: receipt.logs, eventName: "CharityProjectCreated" })[0].args.projectId;

    const now = (await pub.getBlock()).timestamp;
    const productMeta = await postMetadata("product", cause.product.meta);
    await send(R.merchant, {
      ...c.campaigns,
      functionName: "createCampaign",
      args: [
        {
          productId: keccak256(toBytes(`${R.merchant.address}:${cause.product.slug}`)),
          projectId,
          paymentToken: dep.MockUSDC,
          unitPrice: usdc(cause.product.price),
          fixedDonationAmount: cause.product.fixed ? usdc(cause.product.fixed) : 0n,
          percentageDonationBps: cause.product.percentBps ?? 0,
          saleStart: now - 60n,
          saleEnd: now + 60n * 60n * 24n * 60n,
          refundWindow: 0n,
          maxDonation: 0n,
          metadataHash: productMeta,
        },
      ],
    });
    const campaignCount = await pub.readContract({ ...c.campaigns, functionName: "campaignCount" });
    const camp = await pub.readContract({ ...c.campaigns, functionName: "getCampaign", args: [campaignCount] });
    for (let i = 0; i < cause.orders; i++) {
      await send(R.buyer, {
        ...c.router,
        functionName: "checkout",
        args: [camp.productId, campaignCount, 1 + i, dep.MockUSDC, keccak256(toBytes(`seed:${CHAIN_ID}:${cause.product.slug}:${i}`)), camp.unitPrice, now + 3600n],
      });
    }
  }
}

async function main() {
  const res = await fetch(`${APP}/api/data/stats`).catch(() => null);
  if (!res?.ok) throw new Error(`The web app is not reachable at ${APP}. Start it first.`);

  const existing = await pub.readContract({ ...c.charities, functionName: "projectCount" });
  const step = (m) => console.log(`• ${m}`);
  if (existing >= 3n) {
    console.log("Already seeded.");
    return;
  }
  if (existing > 0n) {
    step("Adding more causes to the existing demo");
    await seedMoreCauses(step);
    console.log("\nDone. Open " + APP + "/projects");
    return;
  }

  step("Funding demo wallets");
  await fundWallets();

  step("Roles: grant verifier");
  const verifierRole = keccak256(toBytes("VERIFIER_ROLE"));
  await send(R.admin, { ...c.evidence, functionName: "grantRole", args: [verifierRole, R.verifier.address] });

  step("Merchant applies and is approved");
  const merchantMeta = await postMetadata("merchant-profile", {
    name: "Lion City Learning Co.",
    description: "Educational stationery and reading gear sold in Singapore.",
    website: "https://example.com/lion-city-learning",
  });
  await send(R.merchant, { ...c.merchants, functionName: "applyAsMerchant", args: [R.payout.address, merchantMeta] });
  await send(R.admin, { ...c.merchants, functionName: "approve", args: [R.merchant.address] });

  step("Charity applies and is approved");
  const charityMeta = await postMetadata("charity-profile", {
    name: "Bright Steps Community Fund",
    description: "A pilot charity supporting after-school learning for low-income families.",
    registrationNo: "DEMO-0001",
  });
  await send(R.charity, { ...c.charities, functionName: "applyAsCharity", args: [charityMeta] });
  await send(R.admin, { ...c.charities, functionName: "approve", args: [R.charity.address] });

  step("Charity creates a 2-of-3 treasury and a project");
  const created = await send(R.charity, {
    ...c.factory,
    functionName: "createTreasury",
    args: [[R.signer1.address, R.signer2.address, R.signer3.address], 2n],
  });
  const treasury = parseEventLogs({ abi: abis.treasuryFactoryAbi, logs: created.logs, eventName: "TreasuryCreated" })[0].args.treasury;
  const projectMeta = await postMetadata("project", {
    title: "Learning kits for students in need",
    summary:
      "Provide study kits (notebooks, stationery, reading lights) to students from low-income families. Beneficiary details are kept off-chain.",
    category: "Education",
    location: "Singapore",
  });
  await send(R.charity, { ...c.charities, functionName: "createProject", args: [treasury, projectMeta, usdc(5000)] });

  step("Merchant publishes two products");
  const now = (await pub.getBlock()).timestamp;
  const kitMeta = await postMetadata("product", {
    name: "Education Kit",
    description: "A notebook set and stationery pack. For every kit sold, 1 mUSDC is donated automatically.",
  });
  const lightMeta = await postMetadata("product", {
    name: "Reading Light",
    description: "A rechargeable desk lamp. 5% of every sale is donated. Refundable for one day while funds sit in escrow.",
  });
  const base = { projectId: 1n, paymentToken: dep.MockUSDC, saleStart: now - 60n, saleEnd: now + 60n * 60n * 24n * 60n, maxDonation: 0n };
  await send(R.merchant, {
    ...c.campaigns,
    functionName: "createCampaign",
    args: [{ ...base, productId: keccak256(toBytes(`${R.merchant.address}:education-kit`)), unitPrice: usdc(25), fixedDonationAmount: usdc(1), percentageDonationBps: 0, refundWindow: 0n, metadataHash: kitMeta }],
  });
  await send(R.merchant, {
    ...c.campaigns,
    functionName: "createCampaign",
    args: [{ ...base, productId: keccak256(toBytes(`${R.merchant.address}:reading-light`)), unitPrice: usdc(40), fixedDonationAmount: 0n, percentageDonationBps: 500, refundWindow: 86_400n, metadataHash: lightMeta }],
  });

  step("Buyers fund wallets and place orders");
  for (const b of [R.buyer, R.buyer2]) {
    await send(b, { ...c.usdc, functionName: "faucet", args: [b.address, usdc(1000)] });
    await send(b, { ...c.usdc, functionName: "approve", args: [dep.CheckoutRouter, usdc(1000)] });
  }
  const buy = async (buyer, campaignId, qty, label) => {
    const camp = await pub.readContract({ ...c.campaigns, functionName: "getCampaign", args: [campaignId] });
    await send(buyer, {
      ...c.router,
      functionName: "checkout",
      args: [camp.productId, campaignId, qty, dep.MockUSDC, keccak256(toBytes(`seed:${CHAIN_ID}:${label}`)), camp.unitPrice, now + 3600n],
    });
  };
  const plan = [
    [R.buyer, 1], [R.buyer, 2], [R.buyer, 1], [R.buyer, 3], [R.buyer, 1],
    [R.buyer2, 2], [R.buyer2, 1], [R.buyer2, 1], [R.buyer2, 4], [R.buyer2, 1],
  ];
  for (const [i, [buyer, qty]] of plan.entries()) await buy(buyer, 1n, qty, `kit-${i}`);
  await buy(R.buyer, 2n, 1, "light-0");

  step("Charity uploads and registers three evidence files");
  const files = [
    { kind: 2, name: "procurement-invoice.txt", text: "DEMO procurement invoice: 20 learning kits purchased from approved supplier. Total 400.00. (simulated)" },
    { kind: 3, name: "delivery-receipt.txt", text: "DEMO delivery receipt: 20 learning kits handed over to the community centre. Signed by staff. (simulated)" },
    { kind: 4, name: "service-record.txt", text: "DEMO service record: after-school session attendance summary, anonymised counts only. (simulated)" },
  ];
  const evidenceIds = [];
  for (const f of files) {
    const form = new FormData();
    form.set("projectId", "1");
    form.set("file", new Blob([f.text], { type: "text/plain" }), f.name);
    const up = await fetch(`${APP}/api/evidence`, { method: "POST", headers: await authHeaders(R.charity, "evidence:upload"), body: form });
    const body = await up.json();
    if (!up.ok) throw new Error(`upload: ${body.error}`);
    const receipt = await send(R.charity, { ...c.evidence, functionName: "submitEvidence", args: [1n, f.kind, body.contentHash, body.storageRef] });
    evidenceIds.push(parseEventLogs({ abi: abis.evidenceRegistryAbi, logs: receipt.logs, eventName: "EvidenceSubmitted" })[0].args.evidenceId);
  }

  step("Verifier approves two items (one stays pending for the demo)");
  const note = await postMetadata("note", { text: "Matches the procurement and delivery records." });
  for (const id of evidenceIds.slice(0, 2)) {
    await send(R.verifier, { ...c.evidence, functionName: "verifyEvidence", args: [id, true, note] });
  }

  step("Treasury signers approve a disbursement");
  const purpose = await postMetadata("note", { text: "Reimburse supplier for 20 learning kits (see procurement invoice)." });
  const t = { address: treasury, abi: abis.donationTreasuryAbi };
  await send(R.signer1, { ...t, functionName: "submit", args: [dep.MockUSDC, R.payout.address, usdc(8), purpose] });
  await send(R.signer2, { ...t, functionName: "approve", args: [1n] });
  await send(R.signer1, { ...t, functionName: "execute", args: [1n] });

  step("Charity publishes the first impact report");
  const prep = await fetch(`${APP}/api/reports/prepare`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders(R.charity, "report:prepare")) },
    body: JSON.stringify({ projectId: "1" }),
  });
  const report = await prep.json();
  if (!prep.ok) throw new Error(`report: ${report.error}`);
  await send(R.charity, { ...c.reports, functionName: "publishReport", args: [1n, report.reportHash, report.uri] });

  await seedMoreCauses(step);

  console.log(`\nSeeded. Treasury ${treasury}. Open ${APP}/projects`);
  if (!LOCAL) console.log("Role wallet keys: apps/web/.data/demo-wallets.json (import into MetaMask to act as a role).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
