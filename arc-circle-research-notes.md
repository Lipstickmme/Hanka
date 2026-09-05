# Arc and Circle research notes

## Sources reviewed

- Circle Developer Docs: https://developers.circle.com/
- Arc Testnet contract addresses: https://docs.arc.io/arc/references/contract-addresses

## Confirmed Arc Testnet facts

Arc Testnet currently exposes **USDC as the native EVM gas asset**, plus an optional ERC-20 interface at `0x3600000000000000000000000000000000000000`. The native USDC gas balance uses 18-decimal precision, while the ERC-20 interface uses 6 decimals. The application contract should interact only through the ERC-20 interface and determine decimals at runtime rather than mixing native and ERC-20 balances.

Arc Testnet lists **EURC** at `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`, with 6 decimals. Circle’s cirBTC documentation separately lists **cirBTC** at `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` on Arc Testnet. Circle states that testnet cirBTC has no financial value and is not backed by real Bitcoin.

All addresses on the official Arc page are explicitly for **Arc Testnet**; mainnet addresses are not available. Any application contract must therefore label the integration as testnet-only and keep Arc mainnet disabled until official parameters and audited production deployment are available.

## Design implications

The initial escrow should accept the verified Arc ERC-20 USDC interface and EURC only. `cirBTC` must be displayed as unavailable until Circle/Arc publishes an official Arc contract address and the product supports its price, decimal, and settlement rules. The contract should not use the StableFX escrow contract: it is documented for Circle’s FX workflow, not for HANKA’s bilateral collateral or task escrow.

For HANKA collateral and task escrow, each deposit, approval, deadline, cancellation, release, refund, fee, and dispute decision needs an onchain event. Neither private keys nor user signatures should be collected by the web application: wallets should sign and submit transactions directly. A restricted multisig or timelocked dispute-resolver address is safer than a single developer wallet for privileged settlement actions.

## Wallet and execution configuration

Official Arc documentation specifies Arc Testnet chain ID `5042002`, primary RPC `https://rpc.testnet.arc.io`, WebSocket `wss://rpc.testnet.arc.io`, explorer `https://testnet.arcscan.app`, and the Circle faucet at `https://faucet.circle.com`. The docs recommend standard EVM wallet tooling using `viem` and `wagmi`; `arcTestnet` is available in `viem/chains`.

Arc supports Solidity, standard wallets, viem, ethers, Foundry, and Hardhat. Its Arc-specific native-USDC behavior matters for escrow: value transfers can revert because of zero-address, blocklist, forbidden-burn, precompile, or self-destruct restrictions. HANKA should therefore avoid native-value movement inside its escrow entirely and use safe ERC-20 calls for all market custody and release actions. Contract testing must include Arc RPC testing, since a standard local EVM does not simulate these native-USDC and blocklist behaviors.

## Revised token decision

The testnet foundation can allow the three official addresses: Arc ERC-20 USDC, Arc EURC, and Arc Testnet cirBTC. Each is allowlisted in the contract at deployment, uses the token’s runtime `decimals()` value, and is shown clearly as **testnet-only**. Mainnet activation remains unavailable until Arc publishes official mainnet configuration and the contracts complete an independent security review.
