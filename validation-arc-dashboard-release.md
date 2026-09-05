# Arc personal dashboard validation

## Responsive visual review — 27 August 2026

The `/arc/dashboard` route maintains HANKA’s dark editorial system at 1280px and 375px widths. The active/completed exchange and task counters, refresh control, status-gated explanation, and Arc-market return link remain readable and vertically stack without horizontal clipping on mobile.

## Data and privacy boundary

The dashboard intentionally displays an **Awaiting reviewed contract** state until `VITE_ARC_TESTNET_ESCROW_ADDRESS` is configured. Once enabled, it reads only public Arc contract state and filters records to the connected EVM wallet’s maker/counterparty/requester/task-taker roles. It does not require a private key, seed phrase, or database copy of private task instructions.

## Automated validation

`pnpm check` passed. The full non-network regression suite passed with **29 files and 91 tests**. Both Vercel frontend and serverless function builds passed, and `git diff --check` reported no whitespace errors. The dashboard and the market page are independently lazy-loaded; the shared EVM client is delivered only with those Arc routes rather than the existing Solana market’s initial path.
