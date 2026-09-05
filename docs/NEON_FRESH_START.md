# HANKA Fresh Neon Database

HANKA uses **one clean Neon PostgreSQL database** for its wallet-first market. No records from the former MySQL/TiDB deployment are copied, shown, or modified. The active `vouch-market` Vercel project begins with an empty board and writes all new listings, requests, payment claims, completion records, and private operations records to Neon.

## Required active-project configuration

The Neon integration must be connected to the active Vercel project named `vouch-market`, which is the project intended to serve `www.hankavirality.xyz`. The integration should provide a production `DATABASE_URL`; HANKA also accepts `POSTGRES_URL` if that is the name supplied by the integration. The value must be a PostgreSQL URL. Neon documents its Vercel integration as providing `DATABASE_URL` and related PostgreSQL connection variables.[1]

Vercel runs `pnpm run build:vercel:function && pnpm run build:vercel` without connecting to the database during build. The single API function packages `drizzle/neon/**` and initializes the fresh schema on its first Neon-backed request. Drizzle records applied migrations so later requests and deployments run only outstanding schema changes. Do not provide a legacy MySQL connection string.

The application has one checked-in JavaScript API entry at `api/trpc/[...path].js`, regenerated from maintained source at `server/vercel/trpcHandler.ts` by the build. Its adjacent `api/trpc/package.json` declares the bundled file as CommonJS for the Neon WebSocket dependency chain while preserving Vercel’s standard JavaScript function discovery. It serves `/api/trpc/*`; the SPA rewrite keeps `/market` and `/ops` usable as direct links while excluding `/api/*` from that fallback.[2]

## Intentional fresh-start behavior

| Area | HANKA behavior |
| --- | --- |
| Durable store | Neon PostgreSQL only. |
| Public board | Reads directly from Neon and starts empty. |
| Historic rows | Intentionally not transferred, displayed, or deleted. |
| Cache and limiter service | Upstash has been removed entirely. |
| Market safeguards | Signed wallet actions, Solana USDC verification, source-to-target uniqueness, and wallet-only operations remain in place. |

Keep `DATABASE_URL` or `POSTGRES_URL`, `SOLANA_RPC_URL`, `SOLANA_RECIPIENT_WALLET`, and `ADMIN_SOLANA_WALLETS` server-side. The database URL and any Solana operational controls must not be placed in browser-exposed `VITE_*` variables.

## Verification sequence

First confirm that the active Vercel project has the linked Neon connection variable without exposing its value. After deployment, request `/api/trpc/market.board` and confirm an HTTP 200 response with the default project and empty offers and requests. Only then use a wallet-signed, non-payment test action if further lifecycle validation is needed. No fund transfer is required for setup verification.

> Do not delete `vouch-market-mrx9` until `vouch-market` is confirmed as the project attached to `www.hankavirality.xyz` and it has the Neon connection variable. The duplicate project is not used by this codebase.

## References

[1] Neon, [Neon-managed Vercel integration](https://neon.com/docs/guides/neon-managed-vercel-integration).

[2] Vercel, [Rewrites](https://vercel.com/docs/routing/rewrites).
