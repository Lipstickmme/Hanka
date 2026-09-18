# Hanka Marketplace — mainnet plan

**Status:** proposed, not built. Nothing in this document has been implemented.
**Target chain:** Arc mainnet, chain ID `5042`, USDC as native gas.
**Date:** 2026-09-18

---

## 0. Decisions already locked

| Decision | Choice | Consequence |
| --- | --- | --- |
| Chain | Arc mainnet (`5042`) | Continuity with existing branding; USDC gas means users need no second token. Contracts stay chain-agnostic so Base is a deploy, not a rewrite. |
| Owner access to funds | **Protocol fees only** | Escrow is never sweepable by the operator. This is what makes "we don't hold your money" a true, provable statement. |
| X / Discord account sales | Phase 2 | Highest fraud and ToS surface; needs a real handover protocol, not plain escrow. |
| Launch posture | Capped soft launch → audit → raise caps | Bounds the blast radius of an unknown bug while still shipping. |

### Open items that must be resolved before deploy

1. **The ERC-20 USDC address on Arc mainnet, and its decimals.** On testnet the interface sits at `0x3600000000000000000000000000000000000000` with 6 decimals. The mainnet equivalent must be read from Circle/Arc official docs, not assumed. `pnpm arc:doctor` should be extended to verify it on the target chain before any deploy.
2. **Mobile wallet coverage for chain 5042.** Arc mainnet is days old. Before committing to mobile-first on Arc, verify that MetaMask mobile, Coinbase Wallet, Rainbow and Trust can add and sign on 5042. If coverage is thin, the `wallet_addEthereumChain` path we already ship becomes the primary onboarding route and needs explicit testing on each.
3. **Who holds the multisig keys**, and where the timelock delay lands (48h proposed).

---

## 1. Honest baseline: what exists today

- Two escrow contracts in-repo: `HankaArcEscrow` (~400 lines) and `HankaMarketV2` (~840 lines). The deployed testnet address is v1.
- `HankaMarketV2` is the opposite of "simple but effective": EIP-712 source attestations, social offers, retention bonds, source-metric minimums, restricted-source registries. Large attack surface, much of it enforcing claims the chain cannot actually verify.
- Frontend reads chain state by scanning record IDs (capped at 300, 8-way concurrency). This is a testnet-scale device and will not survive mainnet.
- Neither contract is upgradeable, audited, or pausable in the way this plan requires.

**Recommendation: write one new contract. Do not extend V2.** Every category in the brief is the same primitive, and V2's machinery is cost without benefit.

---

## 2. The core insight — one primitive, not five

Task bounties, points sales, airdrop-farming jobs, community-participation rewards, and later account sales are all the same shape:

> Someone funds an amount. Someone else claims it. Evidence is produced. The money settles.

So the contract has **one record type and one lifecycle**. Categories are *metadata*, not code paths. This is what makes the contract both simple and complete — adding a category later is a UI change and a `uint8`, not a contract upgrade.

---

## 3. Contract: `HankaMarket`

### 3.1 Record

```solidity
enum DealState { None, Open, Claimed, Submitted, Released, Disputed, Refunded }

struct Deal {
    address creator;       // funded it
    address worker;        // claimed it; address(0) until claimed
    address token;         // allowlisted ERC-20 (USDC at launch)
    uint128 amount;        // escrowed reward
    uint128 workerBond;    // optional anti-spam stake, refunded on delivery
    uint64  claimBy;       // FCFS claim deadline
    uint64  deliverBy;     // evidence deadline
    uint64  reviewBy;      // auto-release point after submission
    uint16  feeBps;        // snapshotted at creation
    uint8   category;      // metadata only — no branching on this
    DealState state;
    bytes32 termsHash;     // keccak of the off-chain brief
    bytes32 evidenceHash;  // keccak of the full evidence payload
}

// Stored separately so the hot struct stays cheap to read.
mapping(uint256 => string) public evidenceURI;   // the social post link, on chain
```

The evidence **link is stored on chain as a string**, bounded to 256 bytes, exactly as the brief requires — not merely hashed. It costs gas, but it makes every settled deal publicly auditable by anyone, which is the point. The longer evidence notes stay off-chain under `evidenceHash`.

### 3.2 Lifecycle

```
              cancel (creator, pre-claim)        ┌──────────┐
        ┌─────────────────────────────────────▶ │ Refunded │
        │     expire (anyone, past claimBy)      └──────────┘
        │                                             ▲
   ┌────┴───┐   claim    ┌─────────┐  submit   ┌──────┴────┐
   │  Open  │──────────▶ │ Claimed │─────────▶ │ Submitted │
   └────────┘   FCFS     └─────────┘  evidence └───────────┘
                              │                      │
                              │ past deliverBy       │ release (creator, any time)
                              │ → refund creator     │ past reviewBy → release (anyone)
                              ▼                      ▼
                         ┌──────────┐          ┌──────────┐
                         │ Refunded │          │ Released │
                         └──────────┘          └──────────┘
                                   dispute (either party)
                                          ▼
                                   ┌───────────┐  arbiter rules
                                   │ Disputed  │───────────────▶ Released / Refunded
                                   └───────────┘
```

Seven states, six transitions. That is the whole protocol.

### 3.3 Why release is not automatic on evidence submission

The brief says the reward should unlock when evidence is submitted. Taken literally that is trivially drained: anyone claims a deal, submits any string, and takes the money. The contract cannot read X or Discord, and no honest design can pretend otherwise.

So submission **starts a review window** instead:

- Creator can release immediately — one tap, the happy path, and the common case.
- If the creator goes silent, **anyone** can release once `reviewBy` passes. This protects the worker from an unresponsive or malicious creator, which is the failure mode plain escrow usually gets wrong.
- Either side can dispute before release.

The money is genuinely locked from the moment of funding until one of those three things happens. No one — including the operator — can take it out any other way.

### 3.4 First-come-first-serve without handing the market to bots

Public FCFS on-chain is a bot magnet: scripts will take every deal the instant it opens, and real users never get one. Two mitigations, both cheap and oracle-free:

1. **Per-wallet open-claim cap.** A wallet may hold at most `maxOpenClaims` unfinished claims (default 3). Stops one bot hoarding the board.
2. **Optional worker bond.** The creator may require the claimer to stake a small amount, returned in full on delivery and forfeited to the creator only if they claim and never deliver. This makes spam-claiming cost money and is the single most effective lever.

Reputation gating (minimum completed deals) is available later as a third layer, computed off-chain and enforced by a signed allowance — deliberately **not** in v1, because it is the kind of complexity that made V2 unmaintainable.

### 3.5 Fees, and the invariant that makes the trust claim true

Fees are snapshotted per deal at creation, so a later fee change cannot retroactively tax deals already funded. `MAX_FEE_BPS` is hard-capped in code at 500 (5%).

Escrow and fees are accounted **separately**:

```solidity
mapping(address => uint256) public totalEscrowed;  // owed to users
mapping(address => uint256) public accruedFees;    // owed to treasury
```

The safety property of the whole system:

> **Invariant:** for every allowlisted token,
> `token.balanceOf(address(this)) >= totalEscrowed[token] + accruedFees[token]`
> and `withdrawFees` can only ever decrease `accruedFees`.

This is why "we don't hold your money" is printable in the UI. It is not a promise about our intentions — it is a property enforced by code and provable by anyone reading the chain. It must be covered by invariant/fuzz tests (§7) and by a live monitor (§8).

### 3.6 Pause — and the one thing pause must never do

Three switches, not one:

| Switch | Blocks | Never blocks |
| --- | --- | --- |
| `pausedCreation` | new deals being funded | — |
| `pausedClaims` | new claims | — |
| `pausedAll` | both of the above | — |

**Release, refund, expiry and dispute resolution are never pausable.** A pause that freezes withdrawals turns an incident into a hostage situation and would let an operator hold user funds indefinitely — which is precisely what the fees-only decision exists to prevent. Pause stops *new obligations*, never *exits*.

### 3.7 Upgradeability, stated honestly

- **UUPS proxy** (OpenZeppelin), `_authorizeUpgrade` restricted to the owner.
- Owner is a **Safe multisig** (3-of-5 suggested) behind a **`TimelockController` with a 48h delay**. No single key can upgrade.
- `uint256[40] private __gap` reserved in storage for future fields.
- Every upgrade emits an event the UI surfaces on the admin page and the public workflow page.

The honest consequence, which the UI must state plainly: **an upgrade can eventually change the escrow rules.** The timelock means users get 48 hours' notice and can withdraw or settle first. Claiming immutability while shipping a proxy would be a lie, and users who read the code would catch it.

### 3.8 Token safety

- **Allowlist USDC only at launch.** No arbitrary tokens. This sidesteps fee-on-transfer, rebasing and malicious-callback tokens entirely.
- SafeERC20-style `_callOptionalReturn` for non-standard returns.
- `nonReentrant` on every fund-moving external function; strict checks-effects-interactions ordering.
- `receive()` and `fallback()` revert. Note that on Arc, USDC *is* native gas — so the contract must be explicit about accepting the ERC-20 interface and refusing bare value transfers, and `arc:doctor` should confirm which interface the mainnet USDC exposes before deploy.

### 3.9 Soft-launch caps

Enforced at creation, raised later by timelocked governance:

```solidity
uint128 public maxDealAmount;      // e.g. 250 USDC at launch
uint256 public maxTotalValueLocked; // e.g. 25,000 USDC at launch
```

A bug that drains everything can then only drain a bounded amount.

### 3.10 External surface

```
create(token, amount, workerBond, claimBy, deliverBy, reviewBy, category, termsHash) → id
claim(id)                                   payable in bond if required
submit(id, evidenceURI, evidenceHash)       worker only, before deliverBy
release(id)                                 creator any time; anyone after reviewBy
cancel(id)                                  creator only, while Open
expire(id)                                  anyone, past a missed deadline
dispute(id)                                 creator or worker
resolve(id, toCreator, toWorker)            arbiter only; must sum to amount − fee
withdrawFees(token, amount)                 treasury only; bounded by accruedFees
```

Estimated ~400 lines. Roughly half of V2, covering strictly more of the product.

---

## 4. Indexing — the unglamorous blocker

The current ID-scan approach costs 300+ `eth_call`s per page load and cannot filter, sort or search server-side. On mainnet with a unified dashboard and category filters it will be unusable.

**Build a proper indexer before the UI work.** Options, in order of preference:

1. **Ponder** — TypeScript, runs next to the existing Node/Postgres stack, shares the Drizzle schema. Best fit for this repo.
2. **The Graph** — supports Arc mainnet; hosted, but a second infrastructure to operate.

The indexer owns: deal list, filters, sort, search, category counts, dashboard metrics, per-wallet activity and reputation. The chain stays the source of truth; the indexer is a cache that can always be rebuilt from events.

---

## 5. Metadata, images, and the pump.fun-style card

Images are a first-class product requirement, and images are never going on-chain.

- **Upload → S3** (already a dependency), keyed by content hash so the stored image is verifiable against what the creator committed to.
- On-chain `termsHash` commits to a canonical JSON blob: `{ title, summary, deliverables[], imageKey, category, links[] }`.
- Anyone can re-hash the off-chain blob and check it matches the chain. Tampering is detectable.
- Required: image size/type limits, dimension normalisation, a CDN, and a moderation path (report → admin review → hide from index; the chain record obviously cannot be deleted, and the UI should say so).

---

## 6. Chat: what "blockchain chat" should actually mean

Writing chat messages into blocks is the wrong build: permanent, public, unencrypted, expensive per message, and impossible to delete for someone who asks. A chat product needs the opposite of those properties.

**Recommended: XMTP.**

- Wallet identity — your address *is* your handle, no signup.
- End-to-end encrypted, decentralised transport, good mobile SDKs.
- Native group chat for rooms.

On-chain, only what genuinely benefits from being on-chain:

```
RoomRegistry: roomId → { owner, gateToken, gateAmount, feeToken, feeAmount }
```

so paid or token-gated rooms have verifiable, non-custodial access rules. Deal threads derive their conversation topic from the deal ID, so every deal has a chat reachable from its card.

This still delivers "wallet-native chat with rooms, settled on chain" — the access rules and payments are on-chain, the messages are encrypted and off-chain. The plan should say this plainly rather than marketing message storage it does not do.

---

## 7. Testing and security program

**Move the contract toolchain to Foundry.** The current `solc`-via-node scripts cannot express fuzz or invariant tests.

| Layer | What |
| --- | --- |
| Unit | Every transition, every revert, every role. |
| Fuzz | Amounts, deadlines, fee bps, arbitrary actors. |
| **Invariant** | The §3.5 balance invariant, across randomised action sequences. Non-negotiable. |
| Fork | Against Arc mainnet USDC. |
| Static | Slither + Aderyn in CI. |
| External audit | Before caps are raised. |
| Bug bounty | Live at soft launch, scaled to TVL. |

Specific things to prove:
- No sequence of calls lets escrow be withdrawn as fees.
- No sequence lets a deal pay out more than `amount`.
- `resolve` cannot over- or under-pay.
- Pause cannot block an exit.
- Upgrade cannot be executed without the timelock.
- Claim caps and TVL caps hold under concurrency.

---

## 8. Operations

- **Live invariant monitor**: an alert that fires if `balanceOf < totalEscrowed + accruedFees` ever holds, checked every block. This is the canary for the entire system.
- Alerts on: pause toggles, fee withdrawals, upgrade proposals, dispute volume spikes, unusual claim rates.
- Documented incident runbook: who can pause, how, and the exact conditions under which it is appropriate.
- Keys on hardware wallets; multisig signer list documented; timelock delay published.

---

## 9. Mobile-first UI

### 9.1 System
- Design tokens for spacing, radius, type scale; dark-first with the existing HANKA palette.
- 44px minimum tap targets; `env(safe-area-inset-*)` respected throughout.
- Bottom tab bar as primary navigation; **sheets, not dropdowns** (the wallet chooser already works this way).
- Skeleton loading states, optimistic UI on writes, and a persistent pending-transaction indicator.
- A real icon set (Lucide is already a dependency) used consistently, plus category glyphs.

### 9.2 Deal card — the pump.fun-shaped unit
Image-forward, 2-up grid on mobile, 3–4-up on desktop. Each card carries: image, title, category chip, amount badge, countdown to `claimBy`, claim count, and a single primary action. Fast, scannable, dense — the format that makes a board feel alive.

### 9.3 Unified dashboard
Every deal in one list, exactly as asked, with:
- **Category filter chips**: Task · Social Proof · Points · Airdrop Farming · Community · (Accounts, phase 2)
- **Sort**: newest, highest reward, ending soonest, most claimed
- **Metrics row**: total value escrowed, open deals, settled deals, median settlement time, dispute rate
- **Saved views**: all / mine / claimed by me / needs my review

All filtering and sorting served by the indexer, not by scanning the chain in the browser.

### 9.4 The workflow diagram — an in-product explainer
An inline SVG (not an image, so it scales and themes), shown on the landing page and linked from every deal, walking through: **fund → claim → evidence → review → release**, with the escrow box drawn as the contract and explicit callouts:

- ✅ The contract holds the money. Hanka cannot withdraw it.
- ✅ Only you, the counterparty, a timeout, or the arbiter can move it.
- ⚠️ Hanka takes a fee of X% on settlement, and can withdraw **fees only**.
- ⚠️ The contract is upgradeable behind a 48-hour timelock — rules can change with notice.

Stating the limitations next to the guarantees is what makes the guarantees believable.

### 9.5 Admin dashboard
Gated by an **on-chain role read**, never a client-side flag. Provides:
- Dispute queue with evidence links, deal history, and a resolve action with a payout split
- The three pause switches, with current on-chain state
- Fee balances and withdrawal (fees only — there is no escrow withdrawal control to build)
- Cap management (timelocked)
- Upgrade status: pending proposals and their unlock times
- Audit log of every admin action, read from events

---

## 10. Sequencing

| Phase | Work | Gate to next |
| --- | --- | --- |
| 0 | This plan approved; open items in §0 resolved | Decisions locked |
| 1 | `HankaMarket` + Foundry suite + invariant tests | All tests green, Slither clean |
| 2 | Indexer (Ponder) + metadata/image service | Dashboard queries served off-chain |
| 3 | Mobile-first UI rebuild, deal cards, unified dashboard, workflow diagram | Real-device pass on iOS + Android |
| 4 | Admin dashboard | Dispute resolvable end to end on testnet |
| 5 | Chat (XMTP + room registry) | Rooms and deal threads working |
| 6 | **Capped mainnet soft launch** | Invariant monitor live, caps enforced |
| 7 | External audit → raise caps | Audit findings closed |
| 8 | Account-sales category with handover protocol | — |

Phases 1 and 2 can run in parallel with 3 once the ABI is frozen.

---

## 11. Risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Arc mainnet is days old; mobile wallet support unproven | **High** — directly threatens the mobile-first goal | Verify on real devices in phase 0. Keep contracts chain-agnostic so Base is a fallback deploy. |
| Unaudited upgradeable contract holding real money | **High** | Caps + invariant monitor + timelock + audit before caps rise. |
| Evidence cannot be verified on-chain | **High** — inherent | Review window + dispute + arbiter. Never auto-release on submission. Say so in the UI. |
| Bots sniping FCFS deals | Medium | Claim caps + worker bonds; reputation gating held in reserve. |
| Admin key compromise | **High** | Multisig + timelock + no escrow withdrawal path to steal. |
| Image/content moderation | Medium | Report flow, index-level hiding, clear notice that chain records persist. |
| Account sales (phase 2) unenforceable off-chain | **High** | Deferred. Needs bonds, cooling-off and rotation proofs before it ships. |
| Indexer drift from chain | Medium | Chain is source of truth; indexer rebuildable from events; reconciliation job. |

---

## 12. What I recommend against

- **Extending `HankaMarketV2`.** Its attestation and retention machinery encodes claims the chain cannot verify, and it would roughly triple the audit surface for no product gain.
- **Storing chat messages on-chain.** Permanent, public, unencrypted, and expensive — the opposite of what chat needs.
- **A blanket pause that stops withdrawals.** It converts an incident into a hostage situation.
- **Shipping uncapped before audit.** With an upgradeable contract holding third-party funds, an unknown bug is unbounded.
