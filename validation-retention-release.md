# Retention release validation notes

## Visual check — 26 August 2026

The desktop marketplace retains the dark HANKA editorial visual system, full-width Opera underlay, compact live-board layout, USDC wallet control, and disabled Arc EVM “Mainnet soon” option. The private Operations route continues to present its wallet-only authorization gate without exposing settlement mechanics publicly. The retention controls and review queue require an authorized wallet/session and live marketplace records to render; their contracts were validated through focused unit and router workflow tests before responsive review.

## Database migration routing

The managed database console identifies itself as TiDB 8.0.11 and therefore was not given PostgreSQL migration SQL. The generated `drizzle/neon/0007_retention_source_bans.sql` remains the authoritative deployment migration and is applied by the runtime Neon migrator configured in `server/db.ts` when the connected Neon PostgreSQL environment starts.

## Automated and production checks

`pnpm check` passed after the retention implementation. The focused rules, service, router workflow, and administrator-access tests passed, including confirmation that the ban mutation requires an allowlisted wallet and an `admin_access` proof. The final full non-network suite passed with 80 tests, excluding only the external Alchemy RPC health test file. Both `pnpm run build:vercel` and `pnpm run build:vercel:function` completed successfully. The Vite production build continues to report its pre-existing large client-bundle advisory, but the bundle was emitted successfully.

## Responsive check

The 375px mobile market view retains the compact HANKA header, visible Buy and Sell controls, narrow market filters, readable empty-board state, recommended-price cards, and mobile action dock. No horizontal clipping was observed in the captured view.
