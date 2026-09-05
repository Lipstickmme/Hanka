# Vouch Market: Simple Operating Plan

## Purpose

Vouch Market is a **wallet-first USDC marketplace** for CommonsMade/Ethos vouch requests. Buyers create an offer with a vouch-size band, requested quantity, target handle, and USDC offer per vouch. Sellers can post an open offer or fill a buyer’s funded request. The public site communicates market activity and straightforward review states only; it does not expose internal review evidence, payout records, or operational settlement decisions.

> **Public principle:** market-price information is a guidance signal drawn from live entries. It is not a platform-set price, does not guarantee fulfillment, and should never be presented as an appraisal.

## Participant flow

| Stage | Buyer | Seller | Market behavior |
| --- | --- | --- | --- |
| **Create** | Connects a Phantom wallet and creates a request. Under-1k bands cannot be offered below 0.50 USDC per vouch. | Connects a Phantom wallet, signs a message, and posts available vouches or fills a live request. | Requests are private/unfunded until payment verification passes. |
| **Pay** | Approves an exact Circle-issued USDC transfer from the connected wallet. | No on-chain payment is required to list or fill. | The server checks the finalized signature, signing wallet, Circle USDC mint, recipient-wallet ownership, exact amount, and uniqueness of the payment signature. |
| **Fill** | Sees funded requests filling toward the requested quantity. | Uses a wallet signature to attach the receiving address to a bounded fill. | A transactional quantity check blocks overfills. |
| **Complete** | Signs a completion mark after a fully filled request is delivered. | Signs a completion mark on the matched fill. | All participant marks move the record to human review. |
| **Review** | Receives a plain-language “under review,” “completed,” or “needs review” status. | Receives the same status. | The administrator records a sent or withheld manual payout decision in the private workspace. |

## Privacy and access boundary

The **public board** returns only market-facing data: target handle, vouch band, quantity, offer/ask, public ID, and state. It excludes payment signatures, wallet addresses, review notes, payout information, and audit-log detail.

The `/ops` workspace is protected with the project’s existing administrator role. It is the only place that displays payment evidence, the completion queue, payout record controls, and the activity log. Buyer and seller participants do not create product accounts; their wallet signs only the action-specific challenge messages needed to prove control for an offer, fill, completion mark, or cancellation.

## Payment verification controls

The server accepts Circle-issued mainnet USDC on Solana only. The verifier requires an error-free `finalized` signature status, retrieves the parsed transaction, confirms that the buyer wallet authorized the transaction, locates an exact Circle USDC transfer to a token account owned by the configured recipient, and rejects a signature already bound to another market request. Solana’s `getSignatureStatuses` exposes the finalized status required for this check, while `getTransaction` returns the parsed transaction record; Circle lists the canonical Solana USDC mint used by the application.[1] [2] [3]

| Configuration item | Current role | Exposure |
| --- | --- | --- |
| `SOLANA_RPC_URL` | Server-side mainnet RPC for finalized payment inspection. | Never delivered to the browser. |
| `SOLANA_RECIPIENT_WALLET` | Recipient whose USDC token account must receive a matching transfer. | Used by the server and supplied to the wallet transaction builder only when the buyer initiates payment. |
| Circle USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. | Public token identifier, fixed in source. |

## Operating checklist

The administrator should review evidence after all completion marks are present. “Record sent” records that a manual USDC payout has been performed and advances the relevant seller fill to **paid**. When all fills for a request have this result, the buyer request becomes **completed**. “Hold” records a withheld decision and moves the linked request to **needs review**. Neither operation sends funds from the app.

Unpaid requests can be cancelled by the originating wallet using a signed confirmation. Funded listings cannot be cancelled through the public interface. This deliberately avoids public exposure of the internal review process and makes the distinction between an unfunded draft and an active payment-backed request clear.

## Compact archival without scheduled work

The data model carries `archiveEligibleAt`, `archivedAt`, and archive-summary fields, calculated 24 hours after a request, open seller offer, or fill is created. The private review desk exposes **Compact eligible records** as an administrator action. It writes each eligible item into a private sanitized JSON snapshot and then marks it archived. Snapshots contain only market-facing fields, timestamps, and status; they intentionally exclude wallet addresses and payment signatures. The existing public-board queries exclude archived entries.

There is no recurring scheduler, cron endpoint, or background worker. The compact action is request-scoped and therefore remains compatible with Vercel serverless deployments. The archival output is a structured snapshot rather than a browser screenshot so the exact public ID, status, timestamps, and record data remain reviewable.

## Verification performed

The project passes TypeScript validation, a Vercel static build, and 19 Vitest assertions. Coverage includes the configured Solana RPC and recipient wallet, the 0.50-USDC under-1k floor, six-decimal USDC conversion, overfill prevention, wallet ownership checks, payment-signature reuse prevention, direct-purchase completion progression, seller-delisting authorization, archive sanitization and visibility, administrator access denial, and optional Upstash configuration.

## References

[1] Solana, [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses).

[2] Solana, [getTransaction](https://solana.com/docs/rpc/http/gettransaction).

[3] Circle, [USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).
