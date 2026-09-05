# HANKA Arc Testnet deployment and Vercel setup

> **Testnet only.** I am an AI, not a licensed financial advisor. This is technical implementation guidance, not financial, legal, or custody advice. Arc Testnet tokens have no financial value; do not use this workflow to hold real value before an independent contract audit, legal/compliance review, and a multisig dispute process.

## The key rule

**Do not put `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` in Vercel.** The HANKA web app does not need a private key to connect users, approve tokens, create escrow, or read dashboard records. Users’ wallets sign those transactions locally. A deployment key placed in Vercel creates an unnecessary hot-wallet risk if a server route, build log, environment setting, or dependency is compromised.

Use the deployment key only in a local terminal or a dedicated, secret-managed CI deployment job. Never paste it into HANKA, GitHub, a `VITE_*` environment variable, a client-side form, a repository `.env` file, chat, screenshots, or browser extension notes.

## Values and where they belong

| Value | Purpose | Where to keep it | Vercel? |
| --- | --- | --- | --- |
| `ARC_TESTNET_DEPLOYER_PRIVATE_KEY` | Signs the one-time contract deployment | Local terminal session or dedicated deployment CI secret | **No** |
| `ARC_OWNER_ADDRESS` | Contract administrator address | Local deploy command only | No |
| `ARC_RESOLVER_ADDRESS` | Can resolve records already opened as disputes | Local deploy command only | No |
| `ARC_TREASURY_ADDRESS` | Receives accrued protocol fees | Local deploy command only | No |
| `ARC_FEE_BPS` | Contract fee basis points; default `500` = 5% | Local deploy command only | No |
| `VITE_ARC_TESTNET_ESCROW_ADDRESS` | Public deployed contract address used by the browser client | Vercel environment settings | **Yes — this value is public by design** |

## 1. Prepare four separate addresses

Create a **fresh Arc Testnet deployer wallet** in MetaMask, Rabby, Coinbase Wallet, or another EVM wallet. This wallet pays the testnet deployment transaction and should not be your future treasury wallet.

The owner can configure the allowlist and fees, but the fee is capped by the contract at 10%. The resolver can settle only contracts already marked as disputed. The treasury can receive only accrued fees. For Testnet, you may initially use wallets you control, but these must be separate addresses. For any real-value launch, use a multisig for at least the resolver and treasury.

The resolver proposed for this project is `0x93E9076512A833a9B931FDD5cf66F413692e611c`. Use it only after confirming you control it; HANKA cannot verify that from the address alone.

## 2. Add Arc Testnet to the deployer wallet

| Network setting | Value |
| --- | --- |
| Network name | Arc Testnet |
| Chain ID | `5042002` |
| RPC URL | `https://rpc.testnet.arc.io` |
| Currency symbol | USDC |
| Explorer | `https://testnet.arcscan.app` |

Request Arc Testnet USDC from the [Circle Faucet][1]. On Arc, native USDC pays gas. The HANKA contract uses the official ERC-20 USDC interface for escrow transfers, preventing the native-USDC precision and transfer-rule differences from leaking into escrow custody. Arc documents the ERC-20 interface at `0x3600000000000000000000000000000000000000` with 6 decimals. [2]

## 3. Test locally before deploying

In the project folder, run the checks already bundled with HANKA:

```bash
pnpm check
pnpm exec vitest run server/arc.contract.test.ts server/arc.wallet.test.ts server/arc.dashboard.test.ts
```

The output must show the Solidity compilation and Arc tests passing. Do not treat a passing compile as a substitute for an independent Solidity audit.

## 4. Deploy from a local terminal — never from Vercel

Open a terminal in the HANKA project directory. Supply the deployer secret **only for that shell session**, using a hidden prompt; the command does not write it to the repository.

```bash
read -rsp "Arc Testnet deployer private key: " ARC_TESTNET_DEPLOYER_PRIVATE_KEY; export ARC_TESTNET_DEPLOYER_PRIVATE_KEY; echo
export ARC_OWNER_ADDRESS="0xYOUR_OWNER_ADDRESS"
export ARC_RESOLVER_ADDRESS="0x93E9076512A833a9B931FDD5cf66F413692e611c"
export ARC_TREASURY_ADDRESS="0xYOUR_TREASURY_ADDRESS"
export ARC_FEE_BPS="500"
pnpm arc:deploy:testnet
```

Review the printed **owner**, **resolver**, **treasury**, **fee**, and the three configured token addresses before approving any wallet prompt. The command creates one external Arc Testnet deployment transaction. Wait for the success receipt and copy only the printed `HANKA_ARC_TESTNET_ESCROW_ADDRESS=0x...` value.

> Do not send me the private key. If you would like me to guide a live deployment, you must first explicitly confirm the testnet transaction and its consequences in chat; you will still enter the key only in your own terminal or wallet.

## 5. Inspect and test the contract

Open the copied address in [ArcScan][3]. With faucet tokens, test the entire sequence twice from separate wallets: token approval, equal collateral deposit, task funding, first task acceptance, task submission, buyer approval, cancellation, maker decline, and dispute resolution. Confirm that fee accounting, deadlines, terms hashes, and the resolver permission all match your operating policy.

The first HANKA contract is immutable. If a material issue is found, stop and deploy a new testnet address rather than attempting to “upgrade” the existing contract.

## 6. Activate the browser integration in Vercel

After the testnet contract has been reviewed and tested, open your Vercel project, then go to **Settings → Environment Variables**. Add only this public configuration value:

```text
VITE_ARC_TESTNET_ESCROW_ADDRESS=0xTHE_VERIFIED_DEPLOYED_CONTRACT_ADDRESS
```

Add it to **Preview** first, redeploy a preview, and test `/arc` plus `/arc/dashboard` with faucet tokens. After successful verification, add the same **public contract address** to Production and redeploy. Vite embeds values with the `VITE_` prefix into the browser build, so this address is intentionally visible; it is not a secret.

Do not add the deployer key, owner key, resolver key, Circle API key, Circle entity secret, or any seed phrase to Vercel for the current HANKA architecture. The application has no server-side signing requirement.

## 7. Wallet roles in the live interface

| Wallet | What it does | Where it signs |
| --- | --- | --- |
| User wallet | Approves a precise ERC-20 amount; creates, accepts, settles, or disputes its own record | User’s EVM wallet, in-browser |
| Deployer wallet | Deploys the testnet contract once | Local terminal / private wallet only |
| Owner wallet | Configures allowed tokens, fee setting, and delayed resolver or treasury changes | Owner’s EVM wallet |
| Resolver wallet | Allocates escrow only after a record is explicitly disputed | Resolver’s EVM wallet |
| Treasury wallet | Receives already-accrued platform fees | Receives only; owner executes withdrawal |

## References

[1]: https://faucet.circle.com/ "Circle Faucet"
[2]: https://docs.arc.io/arc/references/contract-addresses "Arc Testnet contract addresses"
[3]: https://testnet.arcscan.app/ "ArcScan Testnet explorer"
