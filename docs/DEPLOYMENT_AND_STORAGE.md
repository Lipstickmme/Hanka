# HANKA Deployment and Storage

## Operating model

HANKA deploys the Vite frontend and one request-scoped tRPC serverless API with the active Vercel project. **Neon PostgreSQL is the only backend store.** The public board reads from Neon directly; there is no cache service, no distributed rate-limiter service, no cron process, and no second data store.

> The system starts fresh. Earlier managed-database rows are intentionally not imported, and no historic market records are required for the new deployment.

Vercel Functions provide request-scoped server-side handlers, which keeps database access, Solana verification, administrator checks, and operational records outside the browser.[1]

## Deployment shape

| Component | HANKA implementation | Boundary |
| --- | --- | --- |
| Frontend | `dist/public` Vite build | Public pages, including direct `/market` and `/ops` routes. |
| API | `api/trpc/[...path].js` | One standard JavaScript Vercel function for `/api/trpc/*`, generated from `server/vercel/trpcHandler.ts` during the build. |
| Database | Linked Neon PostgreSQL | Sole durable store for the active market. |
| Schema | `drizzle/neon/0000_sad_lucky_pierre.sql` | Applied idempotently through `pnpm run db:migrate`. |
| Authentication and control | Wallet signatures and allowlisted operations wallet | No public OAuth or X-account connection requirement. |

The Vercel build command is `pnpm run build:vercel:function && pnpm run build:vercel`. It packages the API and frontend without requiring a database connection during build. The API function includes the checked-in Neon migrations and applies outstanding schema changes on its first database-backed request. The Vercel rewrite sends non-API deep links to `index.html` and leaves API requests untouched.[2]

## Active Vercel environment variables

Set these values only on the active `vouch-market` Vercel project. Do not expose any server value as a `VITE_*` variable.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` or `POSTGRES_URL` | Injected by the linked Neon integration; used for the fresh PostgreSQL schema and all market records. |
| `SOLANA_RPC_URL` | Server-side USDC transaction verification. |
| `SOLANA_RECIPIENT_WALLET` | Expected payment-recipient verification. |
| `ADMIN_SOLANA_WALLETS` | Additional wallet-only operations administrators, when needed. |

Neon’s Vercel integration is designed to provide database environment variables to deployments.[3] The database must use a PostgreSQL connection string; legacy MySQL values are unsupported.

## Clean-start verification

After the Vercel deployment completes, verify that `GET /market` renders the SPA and `GET /api/trpc/market.board` returns HTTP 200. The board should initially return the default project with empty request and offer collections. This confirms the schema exists and that production reads from the new Neon database; it does not require a payment or fund transfer.

## References

[1] Vercel, [Functions](https://vercel.com/docs/functions).

[2] Vercel, [Rewrites](https://vercel.com/docs/routing/rewrites).

[3] Neon, [Neon-managed Vercel integration](https://neon.com/docs/guides/neon-managed-vercel-integration).
