# Arc Testnet deployment verification — 27 August 2026

The public ArcScan address page for `0xd274c4b81de9d4b354b8d801d57b28c649323836` shows a successful contract-creation transaction by `0x93E9076512A833a9B931FDD5cf66F413692e611c` and identifies the address as a contract. The explorer shows one transaction, four logs, and a zero USDC contract balance at the time reviewed.

The explorer currently presents raw creation code and a **Verify & publish** option rather than published Solidity source. Before broader testing, publish verification on ArcScan using the exact compiler configuration used by the deployment script: Solidity `0.8.30`, optimizer enabled, optimizer runs `200`, source file `HankaArcEscrow.sol`, with the constructor values used at deployment.

Activation remains limited to Arc Testnet faucet assets. No token transfer or user escrow record has been observed yet.
