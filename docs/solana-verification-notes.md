# Solana Verification Notes

The payment-verification endpoint will accept a submitted transaction signature only after querying a Solana RPC endpoint with `getSignatureStatuses` and `searchTransactionHistory: true`. The status must be present, error-free, and `finalized`; any other state remains pending or is rejected.

The endpoint will then retrieve the transaction with `getTransaction`, requesting parsed encoding and finality. It will verify that the parsed SOL transfer includes the configured recipient wallet, that the payment source matches the linked sender wallet, and that the received lamports meet or exceed the request amount. The exact payment signature will be stored under a unique database constraint so it cannot activate more than one request.

The implementation should use a provider endpoint supplied through an environment variable for production reliability. No payment verification, sender-wallet data, or operational-review details will be exposed by public market queries.

## Simplified implementation decision

The public app will accept Circle-issued mainnet USDC on Solana only. Its canonical mint is `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. The verifier must inspect parsed SPL-token transfer instructions for this mint, locate a transfer to a token account owned by the configured recipient wallet, and compare the six-decimal raw transfer amount to the entry’s expected USDC amount.

The first release will not include user-account authentication or X account linking. Instead, a participant supplies an address and creates a nonce-based wallet attestation message. The public request appears only after its payment signature has been verified. Administrative review and manual payout records are private.

## Sources

1. Solana, [getTransaction](https://solana.com/docs/rpc/http/gettransaction).
2. Solana, [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses).
3. X, [OAuth 2.0 Authorization Code Flow with PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token).
4. Circle, [USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).
