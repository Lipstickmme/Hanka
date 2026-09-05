# HANKA Arc-only unified Bounty release validation

## Verified configuration

The configured public Arc Testnet escrow address was checked through the official Arc Testnet RPC. The address is syntactically valid and returned deployed bytecode. The active marketplace now uses that contract for all public settlement: social proof, vouches, slashes, general Bounties, and point exchanges. The former public manual-OTC recipient is no longer referenced by the client experience. No signing key, seed phrase, or private credential was added to the project.

## Interface review

Desktop and 375px mobile reviews confirmed the following outcomes.

| Area | Verified behavior |
| --- | --- |
| Landing | The dark Opera treatment remains intact, public calls to action now enter the unified Arc Bounty market, and the black Arc mark has a bright backing surface wherever it is shown. |
| Terminal | Compact terminal line copy and full-width code rows avoid ellipsis clipping. Each line continues to type to completion before the next line begins. |
| Unified market | Historic `/market` and `/ops` URLs redirect to Arc. The active public application exposes only EVM wallet connection and Arc Testnet contract settlement. |
| Social-proof Bounty | A requester funds a fixed Bounty reward onchain. The canonical social-proof target, instrument, scope, duration, and retention terms are hashed into that Bounty. A taker adds a source profile only after the contract accepts them. |
| Bounty board | The dense, reference-inspired board reads real open contract records only, supports search, proof-type filtering, reward/newest/ending sorting, and does not create sample activity. |
| Arc records | The personal Arc dashboard detects the configured public contract, offers connected-wallet record discovery, and uses Bounty terminology for task rewards. |
| Mobile | Landing, Bounty board, filters, funding form, side information rail, and Arc activity states remain stacked and legible at 375px width. |

## Validation commands

The full Arc-only regression suite passed: **28 tests across 12 files**. It includes canonical social-proof commitment coverage, Arc-only routing and client-surface assertions, the Bounty board, dashboard discovery, contract source tests, terminal typing, persistence architecture, and Vercel configuration. The public contract-address check passed independently against `https://rpc.testnet.arc.io`.

Final validation passed with `pnpm check`, `pnpm exec vitest run`, `pnpm run build:vercel`, and `pnpm run build:vercel:function`. The frontend build reported an advisory asset-chunk size warning only. The Vercel function bundle completed with no browser-only `import.meta` warning. Source diff hygiene passed after excluding the generated CJS bundle, whose third-party minified output contains non-source trailing whitespace.

## Environment note

The local preview has no Neon connection string, so readable social-proof Bounty metadata may remain unavailable locally. The deployed project’s runtime PostgreSQL connector automatically applies the reviewed additive migration when its configured database is reachable. The environment in this workspace could not apply the migration manually: the managed SQL console points to TiDB and the connected Neon integration lists no accessible project. This does not affect client-side Arc Testnet connection, real Bounty discovery, or onchain personal-ledger reads. If production database configuration is absent, social Bounties remain funded onchain but should be re-opened after database configuration before relying on the readable metadata view.
