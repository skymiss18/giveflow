This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Contract Reads

Business queries read contract state directly with `eth_call`; they do not scan
logs or read the SQLite `events` / `sync_state` tables. Orders, applicants,
campaigns, projects, evidence, reports, verifier roles and paused IDs are
enumerated by the contracts. Treasury membership and proposal state are also
read on-chain. Existing event tables are left untouched but are unused.

SQLite still stores off-chain metadata, evidence file information, POS records
and rate limits. Report and evidence references are stored in contracts; their
content remains off-chain. Historical transaction hashes cannot be recovered
from contract state, so query results return null and omit those explorer links.
Newly submitted transactions still have receipt hashes.

This version requires a fresh full-stack deployment using
`contracts/script/Deploy.s.sol`, followed by `node scripts/sync-abi.mjs` at the
repository root. Archive previous addresses under `contracts/deployments/archive/`
before replacing an active deployment. Do not place same-chain archives alongside
the active JSON files, since the generator reads all top-level JSON files.
Update `RELAY_ALLOWED_TOKENS`, rebuild/restart the app, then run the seed script
with the desired `CHAIN_ID`. Previous contracts and funds remain untouched;
the new deployment has separate business records.

From the repository root, validate with `pnpm --filter web test`,
`pnpm --filter web typecheck`, and `pnpm --filter web test:e2e`. E2E uses its own
Anvil node, fresh database and development server. Both client and server RPC
settings are overridden to keep it isolated from Sepolia.

## Development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
