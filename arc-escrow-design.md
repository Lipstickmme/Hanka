# HANKA Arc Testnet escrow design

> **Testnet design only.** Arc Testnet assets have no financial value. This design is a software specification, not legal, financial, or investment advice. A production deployment requires an independent Solidity security audit and jurisdiction-specific legal review.

## Objective

The Arc extension adds two EVM settlement products while retaining the current Solana USDC market as a separate alternative:

| Product | Onchain promise | Offchain component | Prohibited assumption |
| --- | --- | --- | --- |
| Point exchange | Both counterparties lock an agreed amount of an allowlisted token. The contract releases the agreed collateral according to a joint settlement, an explicit unilateral-decline rule, or a dispute decision. | Airdrop eligibility, point balances, screenshots, terms, and any value assessment. | The contract cannot know an airdrop’s future value or whether points were delivered. |
| Task escrow | A requester locks a reward, a first confirmed onchain taker reserves the task, and the requester approves completed work for an onchain release. | Task instructions, evidence, review, and delivery quality. | “First click” is not final; the first valid transaction included onchain wins. |

The contract keeps escrowed token transfers entirely in ERC-20 calls. On Arc, native USDC and the ERC-20 USDC interface view the same balance at different precisions; custody must use the 6-decimal ERC-20 interface, never `msg.value`.

## Accepted Arc Testnet tokens

| Symbol | Arc Testnet address | Decimals | Initial status |
| --- | --- | --- | --- |
| USDC | `0x3600000000000000000000000000000000000000` | 6 via ERC-20 interface | Enabled in contract configuration |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | 6 | Enabled in contract configuration |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` | Read from token contract | Enabled only as Circle’s testnet token; it has no BTC backing or financial value on testnet |

The contract does not accept arbitrary token addresses. An administrator may add or remove a token only through an onchain event. Token decimals are read at deployment/configuration time and should be re-checked by the client before displaying token amounts.

## Point exchange state machine

1. **Create and fund.** The maker supplies an agreement hash, counterparty address, token, collateral amount, expiry, and optional public metadata URI. The maker approves the exact ERC-20 amount and the contract transfers it into escrow.
2. **Accept and fund.** The specified counterparty signs by calling `acceptPointExchange` and depositing the equal collateral amount. Both signed transactions create the complete onchain agreement.
3. **Settle jointly.** Each participant submits the same settlement hash that encodes the agreed payouts. The contract releases only when both approvals match; the payout sum must equal the total collateral less the platform fee.
4. **Unilateral decline.** Before the settlement deadline, the maker can explicitly decline. The contract returns the taker’s collateral and transfers the maker’s collateral, less the protocol fee, to the taker. This is a deterministic predefined penalty, not an oracle-based “future point value.”
5. **Dispute.** Either party can open a dispute after both deposits. Only the configured resolver can allocate the escrowed balance between the two participants; every decision is emitted onchain. The resolver cannot withdraw arbitrary non-disputed escrow.
6. **Timeout.** An unaccepted maker position can be cancelled and refunded. A fully funded but unresolved trade becomes dispute-eligible after expiry rather than automatically favouring a party.

The agreed cash value remains the value both users lock at creation and acceptance; no future airdrop-price calculation is automated. This avoids an untrustworthy or manipulable price oracle.

## Task escrow state machine

1. **Create and fund.** The requester locks a reward with a canonical task hash and deadline. Detailed task steps, names, and private evidence remain in HANKA’s database; the contract receives only their cryptographic hash and an optional public URI.
2. **First valid acceptance.** Any eligible wallet calls `acceptTask`. The first transaction included by Arc reserves the task, and the contract rejects all later attempts.
3. **Submit work.** The selected taker calls `submitTask` with a delivery-evidence hash. This does not move tokens.
4. **Approve and release.** The requester calls `approveTask` after inspection. The contract pays the taker net of the configured fee and accrues that fee by token for later withdrawal to the treasury.
5. **Cancellation and expiry.** The requester can cancel only before acceptance. After acceptance, an overdue or contested task becomes dispute-eligible; it does not silently release funds to either party.
6. **Dispute settlement.** The resolver releases all or part of the escrow to the requester and/or taker, net of the fee rule, and cannot affect unrelated tasks.

## Access control and safety controls

| Control | Required behavior |
| --- | --- |
| Resolver | Separate `resolver` role. It can settle only records already marked disputed. It cannot create trades/tasks, change user terms, or pull general escrow. |
| Treasury | Receives accrued protocol fees only. A pending treasury change with a delay prevents instant redirection. |
| Fee cap | Default 5%; hard-cap at 10% (1,000 BPS). Fee changes emit events. |
| Reentrancy | Every token-moving external entrypoint is non-reentrant and follows checks-effects-interactions. |
| Tokens | Explicit allowlist; use low-level SafeERC20-compatible transfer checks; no native-value handling. |
| Deadlines | Enforced in UTC Unix timestamps onchain. Timeout moves to a dispute path, never silently confiscates a funded user’s balance. |
| Privacy | Contracts store hashes and optional public URIs, not private task instructions, social accounts, wallet secrets, or proof screenshots. |
| Audit trail | Events cover creation, acceptance, deposits, submission, joint approval, decline, cancellation, dispute, resolution, fee accrual, and withdrawal. |
| Upgradeability | First testnet contract is immutable. Production upgrades, if ever used, require a separately audited timelock/multisig design. |

## Testnet wallet and deployment policy

Users connect from their own EVM wallet (MetaMask, Rabby, Coinbase Wallet, or WalletConnect) and submit `approve` plus escrow transactions locally. The HANKA web app never asks for, transmits, or stores their private key or seed phrase.

For a testnet deployment, the recommended route is a dedicated throwaway Arc Testnet wallet with funds from the Circle faucet. The deployer key must **never** be entered in a public form, committed to Git, included in `VITE_*` variables, or placed in a browser bundle. If a scripted deployer is eventually used, its `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` is supplied only to a local command or protected CI secret. The Vercel application must not receive or use it. Circle’s dev-controlled wallet is an alternative where the user prefers Circle-managed signing and is prepared to securely configure its API key and entity secret.

## Explicit production gates

1. Complete local unit/fuzz testing and Arc RPC integration testing, including Arc’s blocklisted-address revert behavior.
2. Perform an independent Solidity security audit.
3. Replace the single resolver with a multisig/timelock and publish the operational dispute policy.
4. Complete legal and compliance review for collateralized airdrop arrangements, task-market classification, disclosures, sanctions screening, and consumer protection.
5. Obtain Arc mainnet network parameters and official token addresses from Circle/Arc; do not reuse testnet addresses.
