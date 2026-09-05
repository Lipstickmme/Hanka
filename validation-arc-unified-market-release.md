# HANKA Arc Unified Market Release Validation

**Scope.** This record covers the consolidated `/arc` marketplace release. It keeps Bounties, Social Proof, and Point Exchange in a single dashboard using tabs and contextual modal forms. The application presents public Arc Testnet contract state only; it does not generate sample bounties, seller offers, airdrop agreements, metrics, or outcomes.

| Area | Verified behavior |
| --- | --- |
| Unified marketplace | `/arc` renders Bounties, Social Proof, and Point Exchange within one shared dashboard. Bounties list live open contract records; Social Proof lists self-declared source offers; Point Exchange explains named-counterparty, equal-collateral agreements rather than inventing public listings. |
| Purpose-specific forms | General Bounties, social-proof Bounties, social-source offers, delivery submissions, and point agreements each open in dedicated modal forms. Social proof fields include source handle, instrument, availability, public metrics, and self-declared verification status. |
| Social buyer controls | Social-proof Bounties commit buyer-selected minimum followers, Ethos, Kaito, Kaito Aura, and optional self-declared verification requirements into the signed task terms and readable metadata. Server checks declared claimant metrics before Arc acceptance. |
| Retention | A retention record is initiated only after the requester’s Arc payout transaction has confirmed successfully. A requester can submit an evidence reference only during an active retention window. The report explicitly cannot reverse a completed onchain payout or settle a contract dispute. |
| Restriction safeguard | The public-contract resolver is verified server-side before it can confirm or dismiss a report. A confirmed violation records an Arc social-source ban, deactivates active offers for that source, and blocks the banned source handle or seller wallet from new social offers and source claims. Evidence references are not returned by public metadata or offer queries. |
| Airdrop agreements | The interface states that airdrop timing, eligibility, and value are uncertain. The agreement uses participant-chosen equal collateral and matching settlement or the configured resolver’s onchain dispute path; it is not an oracle-priced token sale or a guaranteed outcome. |

## Validation run

The release passed `pnpm check` with no TypeScript errors and an offline Vitest run of **17 files / 45 tests**. The suite excluded only the non-deterministic live Solana RPC test and the externally configured contract-address test. The Vercel client build and bundled CJS function build completed successfully. Source diff whitespace checks completed successfully, excluding the generated function bundle as intended. Desktop and 375px full-page `/arc` checks confirmed the shared tabs, compact market header, responsive search and sorting controls, no fabricated Bounties, and the requester action rail containing the retention-report entry point.

The frontend build emits an existing advisory that one non-critical Vite chunk exceeds the default 500 kB warning threshold. It is a build advisory, not a failed build.

## Persistence dependency

The tracked additive PostgreSQL migrations `0009` through `0013` define the social Bounty metadata, self-attested source metrics, social offers, retention records, and Arc source-ban records. The managed workspace SQL console targets TiDB and rejects these PostgreSQL migrations; therefore it was not used to apply them. The application’s runtime PostgreSQL migrator applies the tracked migrations when the deployed environment has a genuine Neon `DATABASE_URL`. The current local workspace reports that no Neon PostgreSQL connection is configured, so this record does not claim that the new metadata schema was manually applied locally.

## Security boundary

No private key, seed phrase, resolver key, Circle credential, or other signing secret was introduced into client code, source control, GitHub, or deployment configuration. Wallet approvals, task funding, payouts, source attestations, reports, and resolver decisions remain user-wallet-controlled. This validation did not initiate a token approval, task funding, payout, dispute, resolver decision, or any other onchain transaction.
