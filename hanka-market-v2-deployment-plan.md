# HANKA Market V2: Implementation and Deployment Plan

## Scope

`contracts/src/HankaMarketV2.sol` is a **new versioned contract**, not an update to the deployed V1 escrow. It supplies one ERC-20 custody engine for general Bounties, social-proof Bounties with seller-funded retention bonds, and named bilateral airdrop/point agreements. It deliberately does not claim to read X, Ethos, Kaito, Aura, or airdrop data. Those facts require a separately operated source-attestation and evidence-review process.

| Phase | Deliverable | Required decision or exit condition |
|---|---|---|
| 1. Policy | Fee cap, retention bond, case outcome, review time, source assurance labels | Written marketplace rules are approved before implementation is relied upon |
| 2. Contract | `HankaMarketV2.sol`, documented ABI, immutable V2 address | Contract compiles using Solidity 0.8.30 with the IR pipeline |
| 3. Security | Unit tests, state-machine tests, fuzz/invariant tests, independent audit | All custody, deadline, authorization, and accounting paths reviewed |
| 4. Infrastructure | Event indexer, Postgres projection, encrypted evidence service, source-attester process | Dashboard is rebuilt from contract events and database writes are idempotent |
| 5. Testnet pilot | Invite-only faucet-token Bounties, social retention cases, bilateral settlements | Timeout, dispute, cancelled, confirmed, dismissed, and fee paths reconciled against events |
| 6. Launch review | Multisig roles, incident runbook, monitoring, verified code, user-facing terms | Separate explicit approval before a real-value deployment |

## What V2 Enforces

| Market | V2 onchain enforcement | Offchain requirement |
|---|---|---|
| General Bounty | Exact ERC-20 reward custody; accept, submit, approve, dispute, cancel, and expiry state machine; fee snapshot | Readable brief and delivery evidence |
| Social Proof | Source-attester-signed seller/source identity; reservable seller-offer capacity; onchain follower/Ethos/Kaito/Aura/verification minimum checks against the signed attestation; unique source-and-target action key; seller retention bond; paid-only retention case and source restriction | X-account proof, metrics collection, encrypted evidence, human/arbitration judgment |
| Bilateral Agreement | Named counterparties; equal collateral; signed mutual settlement; maker-decline/default schedule; dispute and timeout paths | Terms definition and any subjective airdrop outcome determination |

The predecessor's fee can change at payout. V2 records `feeBpsSnapshot` and the treasury address in each record as it is created. It also has explicit unaccepted, accepted-but-undelivered, submitted-but-unreviewed, and agreement-expiry paths so escrow does not depend on a user returning.

## Economics to Approve Before Deployment

The source lets a buyer choose the social-proof `retentionBond` in token units for each social Bounty. The user interface should make it a clear fixed percentage or fixed range before `createSocialBounty` is called. A recommended product starting point is 20–30% of the reward, with an upper cap appropriate to the market; this is a platform policy choice, not a protocol guarantee.

For a reported removal, the buyer posts an opaque `evidenceHash`, not raw evidence. The arbiter either confirms and sends the entire bond to the requester while restricting the source identity for future V2 social proof, or dismisses and resumes the retention window. If the arbiter does not act by `caseResolveBy`, the contract executes the **preselected** `caseDefaultToRequester` rule. This is intentional: the operator must publish the rule in the UI before acceptance.

For bilateral agreements, neither a price oracle nor a claim that an airdrop will occur is in scope. The maker chooses an exact payout basis-point result for voluntary decline and deadline expiry. Both parties can alternatively sign the same EIP-712 settlement outcome. A dispute is reserved for an explicitly subjective result.

## Required Role Setup

Use separate operational addresses. For a production-like pilot, the administrator and arbiter should be a multisig rather than a personal wallet. The source attester should use a dedicated, protected signing process that is separate from the website and from the treasury.

| Environment variable | Role | Recommended holder |
|---|---|---|
| `ARC_V2_ADMIN_ADDRESS` | Proposes delayed role changes, configures future tokens / fee | Project multisig |
| `ARC_V2_ARBITER_ADDRESS` | Resolves Bounty / agreement disputes and retention cases | Independent multisig or policy panel |
| `ARC_V2_PAUSER_ADDRESS` | Pauses new risk during an incident | Dedicated guardian wallet |
| `ARC_V2_SOURCE_ATTESTER_ADDRESS` | Signs time-limited source-wallet attestations | Dedicated signer service with strict audit logging |
| `ARC_V2_TREASURY_ADDRESS` | Withdraws accrued, already-accounted fees only | Treasury multisig |
| `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` | Signs local deployment transaction only | Local shell environment only; never Git, Vercel, browser, or client code |

## Compile and Test

Run this locally from the repository root:

```powershell
pnpm run arc:v2:compile
```

The contract is compiled with Solidity 0.8.30, optimizer enabled, and `viaIR: true`; the latter is required for the typed V2 state machine to avoid compiler stack-depth limits. The compile script emits no artifacts and requires no key.

Before deployment, add Foundry unit tests and fuzz/invariant tests for every payout, deadline, role, signature, source-attestation, and pause case. Compilation is a syntax check; it is **not** a security audit.

## Testnet Deployment

The script is `contracts/scripts/deployHankaMarketV2Testnet.mjs`. It defaults to the official Arc test USDC ERC-20 address only. To add a supported token intentionally, set `ARC_V2_ALLOWED_TOKENS` to a comma-separated list of ERC-20 addresses after testing each token’s transfer behavior.

```powershell
$env:ARC_V2_ADMIN_ADDRESS = "0xYourAdminMultisigOrTestWallet"
$env:ARC_V2_ARBITER_ADDRESS = "0xYourArbiterWallet"
$env:ARC_V2_PAUSER_ADDRESS = "0xYourGuardianWallet"
$env:ARC_V2_SOURCE_ATTESTER_ADDRESS = "0xYourDedicatedAttesterWallet"
$env:ARC_V2_TREASURY_ADDRESS = "0xYourTreasuryWallet"
$env:ARC_V2_DEFAULT_FEE_BPS = "500"

$secureKey = Read-Host "Paste testnet deployer private key" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
$env:ARC_TESTNET_DEPLOYER_PRIVATE_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

pnpm run arc:v2:deploy:testnet
Remove-Item Env:ARC_TESTNET_DEPLOYER_PRIVATE_KEY
```

This only sends a testnet deployment when the command is run locally. It is **not** appropriate to place the deployer key, source-attester key, resolver/arbiter key, Circle credential, seed phrase, or any other signing secret in Vercel or a `VITE_` variable.

After the receipt succeeds, verify the exact deployed source and constructor arguments on ArcScan before changing any frontend configuration. Arc’s current deployment guide documents Foundry deployment and ArcScan Blockscout verification; it also notes that the network is still testnet and test USDC has no real-world value. [1]

## Integration After Deployment

Do not point the existing frontend at V2 by changing one address alone. V2 has a different ABI and requires new forms for retention bond, metadata hash, review deadline, target action hash, source attestation, typed settlement, and timeouts. The integration work is:

1. Add `VITE_HANKA_MARKET_V2_ADDRESS` as the **only** new public web variable after verification.
2. Add a V2 ABI/client adapter that uses `createBounty`, `createSocialBounty`, `acceptSocialBounty`, `openRetentionCase`, and `createAgreement`.
3. Build an event indexer that tracks the V2 events and uses a replayable cursor; do not scan contract IDs in the browser.
4. Build the source attestation service and encrypted evidence access policy before enabling social Bounties.
5. Keep V1 read-only once V2 is enabled; it cannot be upgraded in place.

## Security Non-Negotiables

> V2 improves the economic and lifecycle rules inside escrow. It still cannot prove offchain social activity or remove a follow on X. All source metrics and offchain evidence must retain clear verification labels and an explicit dispute process.

- Use a multisig for the administrator, arbiter, and treasury. Keep the guardian separate.
- Snapshot fees at creation; never retroactively alter live records.
- Never accept unlimited approvals in the user experience.
- Use EIP-712 domain-bound signatures with an expiry and a consumed digest; V2 does this for source attestations and mutual settlement.
- Store only hashes and opaque references onchain. Keep raw evidence encrypted and access-controlled.
- Treat the testnet pilot as an operational rehearsal, not a real-value launch.

## References

[1]: https://docs.arc.io/arc/tutorials/deploy-on-arc "Arc Docs — Deploy on Arc"
[2]: https://docs.arc.io/arc-chain "Arc Docs — Arc Network"
[3]: https://docs.openzeppelin.com/contracts/5.x/access-control "OpenZeppelin Contracts — Access Control"
[4]: https://eips.ethereum.org/EIPS/eip-712 "EIP-712 — Typed Structured Data Hashing and Signing"
