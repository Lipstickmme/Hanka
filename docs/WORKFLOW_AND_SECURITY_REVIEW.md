# Vouch Market Workflow and Security Review

**Review scope:** Product workflow, code-level security controls, deployment configuration, and manual testing guidance for the current wallet-first USDC marketplace. This is an implementation review, **not** a smart-contract audit, legal opinion, financial advice, or guarantee against loss or fraud.

## Current operating model

Vouch Market is strongest when it is understood as a **human-reviewed marketplace with payment verification**, rather than as an automated escrow protocol. Buyers create a signed request or reserve a seller offer, approve an exact Circle-issued USDC payment from their wallet, and the server confirms that the finalized transfer came from the buyer wallet and reached the configured recipient-owned token account. Sellers and buyers separately mark completion. The administrator then checks the task result and records the manual seller payout decision.

| Stage | Buyer-request path | Direct seller-offer path | Control now present |
| --- | --- | --- | --- |
| Intent | Buyer signs to create a request | Seller signs to list; buyer signs to reserve | Action-bound, one-time wallet challenges with a 10-minute expiry. |
| Payment | Buyer pays exact USDC, then submits transaction signature | Reserved buyer pays exact USDC, then submits signature | Finalized transaction, signer, USDC mint, recipient owner, amount, and freshness are checked server-side. |
| Availability | Request becomes public only after verification | Seller offer reserves for 15 minutes; stale unpaid reservations reopen on later market activity | No permanent buyer lock without a verified payment. |
| Completion | Seller marks work done; buyer confirms | Seller and buyer both mark direct purchase complete | Completion remains a participant statement, not an automatic release. |
| Review | Administrator checks evidence and records payout | Administrator checks evidence and records payout | Gross amount, 5% platform fee, seller net, and payout state remain private. |

## Security findings and improvements applied

The quick review found several high-value risks that were addressed in the current revision.

| Area | Improvement applied | Result |
| --- | --- | --- |
| Buyer identity | Buyer requests now require an action-bound wallet signature before creation. | A caller cannot create an unpaid request attributed to another wallet. |
| Wallet privacy | Wallet activity is now a signed mutation rather than an unauthenticated query. | A public caller cannot enumerate another wallet’s requests, fills, or purchases. |
| Payment replay | A new global `paymentSignatureClaims` registry claims each payment signature transactionally. | The same finalized USDC transfer cannot be credited to both a request and a direct seller-offer purchase. |
| Stale payment race | Finalization updates require the original buyer wallet and `awaiting_payment` state. | A delayed verification cannot activate a listing after its reservation changed. |
| Seller listing lock | Unpaid direct-purchase reservations expire after 15 minutes during normal requests. | A buyer cannot indefinitely remove an offer from the board without paying. |
| Abuse throttling | Public mutations use an optional Upstash sliding-window limit: 30 actions per IP per minute. | Production protection activates when the two Upstash server variables are set. |
| Administrator access | The review desk requires both the existing administrator role and a signed configured recipient-wallet confirmation. | The public market does not expose payout evidence or private operating actions. |

The transaction verifier accepts only finalized Solana transactions and checks transaction status before parsing details.[1] [2] The Circle USDC mint is fixed to the official Solana USDC mint in the application.[3]

## Product improvements that fit the existing process

The first improvement should be **unit clarity**. The interface currently treats the offer as **USDC per point**. Confirm this is your intended market unit. A minimum of `0.50 USDC per point` makes a 100-point request cost 50 USDC; if your intended rule is `0.50 USDC total for under 1,000 points`, the pricing calculation and copy must change before public use. This is the most important product decision remaining.

Next, establish a lightweight internal review checklist. Before recording payout, verify the buyer payment, seller wallet, target account, vouch action, buyer confirmation, and any dispute notes. Use the existing external-reference and administrator-note fields for a manual payment transaction ID and the review reason. This produces a clean operating trail without exposing internals on the public site.

Finally, add an explicit **dispute and response window** in the public terms. A simple statement such as “Buyer and seller completion claims are reviewed manually; unresolved claims remain under review until evidence is assessed” is more accurate than promising a timetable. The app should never imply automatic payout or guaranteed fulfilment.

## Required Vercel and Upstash configuration

Set these values in the **Production** environment in Vercel. Do not expose them to the browser or use a `VITE_` prefix.

| Variable | Purpose | Test after deployment |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Short-lived public-board cache and rate-limit backing service | Create a listing and confirm the board reflects the change after cache invalidation. |
| `UPSTASH_REDIS_REST_TOKEN` | Authenticates server-side Upstash calls | Trigger a few test actions; ensure rate limits respond gracefully rather than failing the site. |
| `SOLANA_RPC_URL` | Finalized USDC verification | Submit a low-value test payment only after confirming the recipient and mint. |
| `SOLANA_RECIPIENT_WALLET` | Payment recipient and administrator-wallet check | Connect the same wallet to the operations page and confirm the signed administrator challenge works. |

Upstash is used only for compact public-market cache state and server-side rate limiting; it is not a payment ledger. Its REST client is designed for serverless access.[4]

## Manual test sequence

| Test | Expected result |
| --- | --- |
| Create buyer request | Wallet first signs a buyer-request message, then the exact-USDC payment dialog appears. The listing is not public until payment verification succeeds. |
| Test a `0.50` value | It is accepted only if the selected under-1k band treats the price as 0.50 USDC **per point**. Confirm this economics decision before production. |
| Reserve seller offer, then do not pay | Offer is unavailable during the hold. After 15 minutes, a normal market request or new purchase attempt reopens it. |
| Purchase seller offer | Buyer signs intent, approves the wallet payment, seller marks done, buyer confirms, then the administrator records the manual payout. |
| Attempt signature reuse | Reusing the same payment signature for another listing fails. |
| Open another wallet’s activity | The application requests a wallet signature; without it, activity is not returned. |
| Seller delist | The seller signs the request; only an open, uncommitted listing can be delisted. |

## Residual risks and launch guardrails

The design still has unavoidable operational risk because sellers’ Ethos-vouch activity is reviewed manually and money is paid manually. Do not launch with high limits until you have tested the full flow with a low-value amount, documented review procedures, and verified administrator access on the production domain. Independent application and operational security review is recommended before holding material user funds.

## References

[1] Solana, [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses).

[2] Solana, [getTransaction](https://solana.com/docs/rpc/http/gettransaction).

[3] Circle, [USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).

[4] Upstash, [Connect with `@upstash/redis`](https://upstash.com/docs/redis/howto/connect-with-upstash-redis).
