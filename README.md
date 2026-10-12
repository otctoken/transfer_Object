# Sui Transfer

An English, non-custodial Sui transfer frontend built with React 19, TypeScript, Vite, Mysten dApp Kit and the Sui gRPC SDK.

## Development

```sh
npm ci
npm run dev
```

Run `npm run build` for a production build in `dist/`. Run `npm test` for amount precision and boundary tests. The production output can be deployed to static hosting.

## Features

- Wallet Standard connection, disconnection and account switching.
- Mainnet, Testnet and Devnet with paginated balance and object queries.
- SUI and standard Coin<T> transfers: select an asset or enter a custom coin type, read token decimals, and convert amounts with BigInt. The SDK resolves asset selection, merging and splitting.
- Transfer directly owned objects by ID or from the owned-object selector. Ownership checks and transaction simulation validate transferability.
- Review sender, recipient, asset and network before requesting a wallet signature. Successful transactions link to SuiScan.
- Validation for addresses, balance, decimal precision and network compatibility; RPC, signing and execution error messages.
- Stale asset responses are discarded after wallet or network changes.

Sui protocol rules still apply. Objects must be directly owned by the current address and allow public transfer. Shared, immutable or contract-locked objects require their own contract flows. Tokens require readable metadata (SUI falls back to 9 decimals). Amounts must fit u64, stay within the available balance and leave enough SUI for gas. The app never requests private keys or signs automatically.

Public gRPC endpoints can rate-limit requests. Configure alternate endpoints in `createClient` in `src/main.tsx`. Transaction history is retained only for the current page session.

## Community

- [X / Twitter — @SuiSgGame](https://x.com/SuiSgGame)
- [Telegram — Sui Nav](https://t.me/Sui_Nav)

## Verification

Type checking, production build and amount precision tests have passed. Wallet selection and transfer mode switching were checked in the browser. Real wallet signing and on-chain transfers require a funded wallet and have not been performed on the user's behalf.
