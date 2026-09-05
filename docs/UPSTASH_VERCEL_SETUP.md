# HANKA Upstash and Vercel Setup

## What Upstash does in HANKA

> **Upstash is a short-lived public-board cache and server-side rate-limit store. It is not the source of truth for listings, payments, allocation history, or payout records.**

HANKA keeps all market records in its durable MySQL/TiDB database. The application writes one public-board cache entry to Upstash with a **45-second TTL**, and clears that key immediately after a market mutation. The cache therefore normally lasts no longer than 45 seconds and may be refreshed sooner after a listing, bid, purchase, fill, delist, or completion update. No wallet addresses, payment signatures, private operations notes, or payout evidence should be written to Upstash.

| Data | Storage location | HANKA retention behavior |
| --- | --- | --- |
| Public market-board response | Upstash Redis | Automatic expiry after 45 seconds; explicit invalidation after market changes. |
| Vouch/slash listings, bids, allocations, and lifecycle states | Durable MySQL/TiDB database | Kept according to the market data and archive policy. |
| Payment signatures, wallet proofs, administrator notes, and payout evidence | Durable MySQL/TiDB database | Never cache in Upstash. |
| Rate-limit counters | Upstash Redis | Short-lived; managed by the rate-limit window. |

Upstash does not impose a 45-second retention limit on a normal claimed database. That is **HANKA’s application cache policy**. Redis keys expire only when an expiry is set; Upstash’s `EXPIRE` command deletes a key automatically once its timeout elapses.[3] Keep the Upstash database for as long as your chosen Upstash plan and account remain active. The separate no-signup scratch database described in Upstash documentation expires after 72 hours; do not use that temporary option for HANKA production.[2] [4]

## Setup checklist

| Step | Action | Result |
| --- | --- | --- |
| 1 | Create or choose a permanent Redis database in the [Upstash Console](https://console.upstash.com/redis). Select a region near your Vercel deployment. | A durable Upstash database for the cache and rate-limit keys. |
| 2 | In the database’s **Connect** area, select the **REST** tab. Copy the HTTPS endpoint and the standard token. | The two server-side values HANKA expects. |
| 3 | In Vercel, open **Project → Settings → Environment Variables**. Add the values to the **Production** environment; add Preview too only if preview deployments should use the cache. | Vercel functions can reach Upstash at runtime. |
| 4 | Set the exact variable names shown below. Do not prefix them with `VITE_`. | The existing HANKA server code recognizes the integration. |
| 5 | Redeploy the `main` branch after saving the values. | Vercel loads newly added variables only on a new deployment.[1] |
| 6 | Open `/market`, then create, amend, or remove a low-risk test listing. Confirm the board changes immediately after the action. | Cache invalidation and durable database fallback are both working. |

## Environment variables

| Vercel variable | Where to get it | Required? | Security rule |
| --- | --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Console → Redis database → **Connect** → **REST** → HTTPS endpoint | Required to enable cache/rate limit | Server-side only; no `VITE_` prefix. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Console → Redis database → **Connect** → **REST** → standard token | Required to enable cache/rate limit | Treat as a secret. Never put it in browser code, GitHub, or screenshots. |
| `DATABASE_URL` | The existing durable MySQL/TiDB provider | Required for existing listings | This is **not** an Upstash value. It must point to the same reachable database containing the market records. |
| `JWT_SECRET` | Existing production secret | Required for server-side application infrastructure | Keep server-side only. |
| `SOLANA_RPC_URL` | Your chosen Solana RPC provider | Required for payment verification | Keep server-side only. |
| `SOLANA_RECIPIENT_WALLET` | Your operating Solana wallet address | Required for payment verification | Must match HANKA’s intended payment-recipient wallet. |
| `ADMIN_SOLANA_WALLETS` | Your allowlisted administrator public keys | Optional | Comma-separated public keys when extra admin wallets are required. |

If you install Upstash through the [Vercel integration](https://vercel.com/integrations/upstash), Vercel can create and link the database for you. Still open the project’s environment-variable screen afterward and confirm that **the exact two names above** are present. If the integration uses a differently named variable, copy the matching endpoint or token value into the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` names used by HANKA.[1]

## Getting and rotating credentials safely

In Upstash, select the Redis database and open **Connect → REST**. Copy the HTTPS endpoint into `UPSTASH_REDIS_REST_URL` and the **standard** token into `UPSTASH_REDIS_REST_TOKEN`. The standard token has full database permissions, so it belongs only in Vercel’s server-side environment settings. Upstash also offers a read-only token, but HANKA needs the standard token because it writes cache entries and rate-limit counters.[2]

When a token may have been exposed, reset the database password in Upstash to revoke the old token, replace the value in Vercel, and redeploy. Do not paste tokens into chat, commit them to the repository, or use a `VITE_`-prefixed variable.[2]

## Why Upstash will not restore missing listings by itself

The current durable database contains the market records. Upstash only caches the already-public board for 45 seconds and is optional: if its configuration is absent or the cache request fails, HANKA falls back to the durable database. An empty Vercel board therefore indicates that Vercel is missing the correct `DATABASE_URL`, is pointing to a fresh database, cannot reach the durable database, or is not serving the `/api/trpc` function. Fix the database/API deployment first; then add Upstash for faster public-board reads and rate limiting.

## References

[1] Upstash, [Vercel – Upstash Redis Integration](https://upstash.com/docs/redis/howto/vercelintegration).

[2] Upstash, [REST API: credentials and token security](https://upstash.com/docs/redis/features/restapi).

[3] Upstash, [EXPIRE command](https://upstash.com/docs/redis/sdks/ts/commands/generic/expire).

[4] Upstash, [Connect with `@upstash/redis`](https://upstash.com/docs/redis/howto/connect-with-upstash-redis).
