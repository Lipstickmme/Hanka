# HANKA Arc Testnet contract workspace

This folder contains **testnet-only contract source and a local deployment preparation script**. It does not deploy anything automatically, and it never reads, sends, or stores a private key in the web app.

## What the contract does

`HankaArcEscrow.sol` accepts only allowlisted ERC-20 contracts for Arc Testnet USDC, EURC, and cirBTC. It implements a bilateral collateral exchange and a task-reward escrow. The testnet contract is deliberately immutable: contract logic cannot be upgraded after deployment.

The configured resolver can settle records already marked disputed. It cannot access unrelated escrow. The owner can configure tokens and fees (capped at 10%), withdraw only accrued fees to the treasury, and changes to the resolver or treasury require a 48-hour onchain delay.

## Arc Testnet values

| Setting | Value |
| --- | --- |
| Chain ID | `5042002` |
| RPC | `https://rpc.testnet.arc.io` |
| Explorer | `https://testnet.arcscan.app` |
| USDC ERC-20 | `0x3600000000000000000000000000000000000000` |
| EURC | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |

## Secure testnet deployment procedure

1. Create a **new dedicated Arc Testnet EVM wallet**. Do not reuse a mainnet treasury or personal wallet. Add Arc Testnet and use the Circle faucet for test tokens.
2. Choose the owner, resolver, and treasury addresses. The specified resolver address is `0x93E9076512A833a9B931FDD5cf66F413692e611c`, but verify you control it before using it. Use a multisig once one is available; never use a personal hot wallet for production dispute control.
3. In a **local terminal only**, set the private key in the process environment. Never commit it, put it in `.env` within this repository, enter it in a browser form, or create a `VITE_*` variable with it. For example: `read -rsp "Arc testnet deployer key: " ARC_TESTNET_DEPLOYER_PRIVATE_KEY; export ARC_TESTNET_DEPLOYER_PRIVATE_KEY; echo`.
4. Set the non-secret constructor values in that same terminal: `ARC_RESOLVER_ADDRESS`, `ARC_TREASURY_ADDRESS`, optional `ARC_OWNER_ADDRESS`, and optional `ARC_FEE_BPS=500`.
5. Run `pnpm arc:deploy:testnet`. This creates an external testnet transaction. Review the printed owner, resolver, treasury, fee, and token list before using it.
6. Wait for the success receipt, inspect the contract on ArcScan, and run an approval/deposit/release/dispute test using only faucet tokens. Then add the resulting **public contract address** to `VITE_ARC_TESTNET_ESCROW_ADDRESS` through the project’s secrets manager.

> Do not run the deployment script until the contract has been independently reviewed. For actual value, a Solidity security audit, a multisig/timelock resolver, and legal/compliance review are mandatory release gates.
