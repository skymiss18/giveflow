import type { Abi, Log } from "viem";
import { parseEventLogs } from "viem";
import * as abis from "@/contracts/abis";
import { getDeployment } from "@/lib/shared/chain";
import { getDb, inTransaction } from "./db";
import { CHAIN_ID, publicClient } from "./chain";

type AbiItem = { type: string; name?: string; inputs?: { type: string }[] };

const REORG_DEPTH = CHAIN_ID === 31337 ? 0 : 6;
const CHUNK = Number(process.env.LOG_CHUNK_SIZE || 2000);
const MIN_INTERVAL_MS = 1500;

const ALL_EVENTS = (() => {
  const seen = new Set<string>();
  const out: AbiItem[] = [];
  for (const abi of Object.values(abis) as unknown as AbiItem[][]) {
    for (const item of abi) {
      if (item.type !== "event") continue;
      const key = `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }
  return out as unknown as Abi;
})();

export type EventRow = {
  id: string;
  blockNumber: number;
  logIndex: number;
  txHash: `0x${string}`;
  address: `0x${string}`;
  name: string;
  args: Record<string, string | number | boolean | string[]>;
  timestamp: number;
};

const replacer = (_: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

function staticAddresses(): `0x${string}`[] {
  const d = getDeployment();
  return [
    d.MerchantRegistry,
    d.CharityRegistry,
    d.PauseController,
    d.ProductCampaign,
    d.CheckoutRouter,
    d.EvidenceRegistry,
    d.ImpactReportRegistry,
    d.TreasuryFactory,
  ];
}

function knownTreasuries(): Set<string> {
  const rows = getDb()
    .prepare("SELECT args FROM events WHERE chain_id = ? AND name = 'TreasuryCreated'")
    .all(CHAIN_ID) as { args: string }[];
  return new Set(rows.map((r) => (JSON.parse(r.args).treasury as string).toLowerCase()));
}

// Many RPC providers reject eth_getLogs calls that name more than a handful of addresses.
const ADDRESS_BATCH = Number(process.env.LOG_ADDRESS_BATCH || 5);

// Load-balanced public RPCs intermittently answer "pruned history unavailable" for ranges that another node serves.
async function getLogsWithRetry(address: `0x${string}`[], fromBlock: bigint, toBlock: bigint, attempts = 8): Promise<Log[]> {
  for (let i = 1; ; i++) {
    try {
      return await publicClient.getLogs({ address, fromBlock, toBlock });
    } catch (e) {
      if (i >= attempts || !/pruned history/i.test(String((e as Error).message))) throw e;
      await new Promise((r) => setTimeout(r, 250 * i));
    }
  }
}

async function fetchLogs(address: `0x${string}`[], fromBlock: bigint, toBlock: bigint): Promise<Log[]> {
  const batches: `0x${string}`[][] = [];
  for (let i = 0; i < address.length; i += ADDRESS_BATCH) batches.push(address.slice(i, i + ADDRESS_BATCH));
  const results = await Promise.all(batches.map((batch) => getLogsWithRetry(batch, fromBlock, toBlock)));
  return results.flat();
}

async function runSync() {
  const dep = getDeployment();
  const db = getDb();
  // viem caches the head for a few seconds; a sync right after a confirmed tx must see the new block.
  const latest = Number(await publicClient.getBlockNumber({ cacheTime: 0 }));
  const fingerprint = `${dep.CheckoutRouter}:${dep.deployBlock}`;

  let state = db.prepare("SELECT last_block, fingerprint FROM sync_state WHERE chain_id = ?").get(CHAIN_ID) as
    | { last_block: number; fingerprint: string }
    | undefined;
  if (state && (state.fingerprint !== fingerprint || latest < state.last_block)) {
    db.prepare("DELETE FROM events WHERE chain_id = ?").run(CHAIN_ID);
    db.prepare("DELETE FROM sync_state WHERE chain_id = ?").run(CHAIN_ID);
    state = undefined;
  }

  const from = state ? Math.max(dep.deployBlock, state.last_block - REORG_DEPTH + 1) : dep.deployBlock;
  if (state) db.prepare("DELETE FROM events WHERE chain_id = ? AND block_number >= ?").run(CHAIN_ID, from);

  const treasuries = knownTreasuries();
  const statics = staticAddresses();

  for (let start = from; start <= latest; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, latest);
    const logs = await fetchLogs(
      [...statics, ...([...treasuries] as `0x${string}`[])],
      BigInt(start),
      BigInt(end),
    );

    const created = parseEventLogs({ abi: ALL_EVENTS, logs, eventName: "TreasuryCreated" });
    const fresh = created
      .map((l) => (l.args as { treasury: `0x${string}` }).treasury)
      .filter((t) => !treasuries.has(t.toLowerCase()));
    if (fresh.length) {
      fresh.forEach((t) => treasuries.add(t.toLowerCase()));
      logs.push(...(await fetchLogs(fresh, BigInt(start), BigInt(end))));
    }

    const decoded = parseEventLogs({ abi: ALL_EVENTS, logs });
    const blocks = [...new Set(decoded.map((l) => l.blockNumber))];
    const stamps = new Map<bigint, number>();
    await Promise.all(
      blocks.map(async (b) => {
        const block = await publicClient.getBlock({ blockNumber: b });
        stamps.set(b, Number(block.timestamp));
      }),
    );

    const insert = db.prepare(
      "INSERT OR REPLACE INTO events (id, chain_id, block_number, log_index, tx_hash, address, name, args, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    inTransaction(db, () => {
      for (const l of decoded) {
        const blockNumber = Number(l.blockNumber);
        insert.run(
          `${CHAIN_ID}:${blockNumber}:${l.logIndex}`,
          CHAIN_ID,
          blockNumber,
          Number(l.logIndex),
          l.transactionHash,
          l.address,
          l.eventName as string,
          JSON.stringify(l.args ?? {}, replacer),
          stamps.get(l.blockNumber) ?? 0,
        );
      }
    });
  }

  db.prepare("INSERT OR REPLACE INTO sync_state (chain_id, last_block, fingerprint) VALUES (?, ?, ?)").run(
    CHAIN_ID,
    latest,
    fingerprint,
  );
}

const g = globalThis as unknown as { __shanliuSync?: { promise?: Promise<void>; last: number } };

/** Brings the local event index up to the chain head. `force` skips the throttle (used after a confirmed tx). */
export async function ensureSynced(force = false): Promise<void> {
  const s = (g.__shanliuSync ??= { last: 0 });
  if (s.promise) {
    await s.promise;
    if (!force) return;
  }
  if (!force && Date.now() - s.last < MIN_INTERVAL_MS) return;
  s.promise = runSync().finally(() => {
    s.last = Date.now();
    s.promise = undefined;
  });
  await s.promise;
}

type QueryOptions = {
  names: string[];
  address?: string;
  /** Matches decoded event args (case-insensitive). */
  where?: Record<string, string | number>;
  order?: "asc" | "desc";
};

export function queryEvents({ names, address, where = {}, order = "asc" }: QueryOptions): EventRow[] {
  const clauses = ["chain_id = ?", `name IN (${names.map(() => "?").join(",")})`];
  const params: (string | number)[] = [CHAIN_ID, ...names];
  if (address) {
    clauses.push("lower(address) = lower(?)");
    params.push(address);
  }
  for (const [key, value] of Object.entries(where)) {
    if (!/^[A-Za-z0-9_]+$/.test(key)) throw new Error("Invalid event arg name");
    clauses.push(`lower(CAST(json_extract(args, '$.${key}') AS TEXT)) = lower(?)`);
    params.push(String(value));
  }
  const dir = order === "asc" ? "ASC" : "DESC";
  const rows = getDb()
    .prepare(
      `SELECT id, block_number, log_index, tx_hash, address, name, args, timestamp FROM events WHERE ${clauses.join(" AND ")} ORDER BY block_number ${dir}, log_index ${dir}`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((r) => ({
    id: r.id as string,
    blockNumber: r.block_number as number,
    logIndex: r.log_index as number,
    txHash: r.tx_hash as `0x${string}`,
    address: r.address as `0x${string}`,
    name: r.name as string,
    args: JSON.parse(r.args as string),
    timestamp: r.timestamp as number,
  }));
}
