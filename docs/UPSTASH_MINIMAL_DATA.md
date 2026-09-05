# Upstash Minimal-State Handoff

## Purpose

Upstash Redis is the **small, serverless-friendly state layer** for the public marketplace. It is not the source of truth for payments, manual payouts, or private operational evidence. The application caches only the already-public market board for a short period and invalidates that cache after marketplace activity changes.

> **Data boundary:** Keep verified payments, wallet ownership, payout records, and administrator decisions in the durable server-side data store. Never place payment signatures, wallet addresses, reviewer notes, or payout evidence in Upstash cache values.

## What Upstash stores

| State | Key pattern | Contents | TTL | Purpose |
| --- | --- | --- | --- | --- |
| Public market board | `vouch-market:public-board:v1` | Public project names, request cards, seller cards, public status, and market midpoint only | 45 seconds | Reduces read load for active listings in serverless requests. |
| Payment and payout evidence | None | Not cached | N/A | Durable server-side data only. |
| Wallet challenges | None in the current adapter | Not cached | N/A | Durable server-side data only. |
| Archive summaries | None in Upstash | Not cached | N/A | Administrator-triggered compact archive path only. |

The Upstash Redis client uses HTTP rather than a long-lived connection, making it appropriate for request-scoped serverless functions.[1] [2]

## Required Vercel environment values

Set the following values in the Vercel project. Both Upstash values are **server-only** and must never be prefixed with `VITE_`.

| Environment variable | Purpose | Required for |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash REST endpoint | Public-board cache |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash REST token | Public-board cache |
| `SOLANA_RPC_URL` | Server-side USDC verification | Payments |
| `SOLANA_RECIPIENT_WALLET` | USDC recipient and administrator-wallet control | Payments and review desk |

The `@upstash/redis` client automatically recognizes the two `UPSTASH_REDIS_REST_*` values and accesses Redis through its REST API.[1]

## No-cron operating model

There are no recurring jobs, timers, or background workers. The private review desk exposes **Compact eligible records** as an administrator action. It archives only eligible records, removes them from public market visibility, and retains a sanitized summary that excludes payment signatures and wallet addresses.

This model is Vercel-compatible because every action runs during an explicit HTTP request. When Upstash is unavailable or not configured in a local environment, the public board safely reads from the durable database instead; no payment or review workflow is blocked.

## Vercel integration steps

Connect the Upstash Redis integration in the Vercel project, confirm that the two REST environment values are added to the production environment, and redeploy. The application requires no browser token, no cron setting, and no long-running worker. After deployment, load `/market`, create or modify a listing, and confirm that the public board refreshes after the mutation invalidates the short-lived cache.

## References

[1] Upstash, [Connect with `@upstash/redis`](https://upstash.com/docs/redis/howto/connect-with-upstash-redis).

[2] Upstash, [REST API](https://upstash.com/docs/redis/features/restapi).
