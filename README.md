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

## Submit a Base64 transaction on the selected network

Select **Base64**, connect the transaction sender's wallet, and choose **Sui Mainnet**, **Sui Testnet** or **Sui Devnet**. Paste the complete Base64 string produced using a client for that same network:

```ts
const bytes = await tx.build({ client });
const base64 = toBase64(bytes);
console.log(base64);
```

For contract deployment, run `sui client publish --serialize-unsigned-transaction` in the Move package directory with the intended Sui CLI environment selected. Paste its unsigned Base64 output, or use **Or import transaction text file** to load a `.txt` or `.base64` file containing only that output. The review identifies `Publish` commands as a contract deployment. Publishing still requires your wallet signature.

Whitespace, surrounding quotes, Base64/text Markdown fences and invisible clipboard separators are accepted without altering transaction bytes. Missing trailing Base64 padding is restored. Invalid characters, truncated input, oversized input and invalid transaction data have separate error messages. Contract module bytecode alone is not a complete transaction. Transactions using address-balance gas and `ValidDuring` expiration are preserved as provided; their epoch range and chain must still match the selected network at execution time.

Use full TransactionData bytes, not `onlyTransactionKind`, JSON or a signature. The sender must match the connected wallet; sponsored transactions needing another signature are not supported. The app preserves all embedded commands and gas settings, simulates against the selected network, displays the decoded transaction and simulated effects, and asks for explicit review before wallet signing on that network. Returned wallet bytes must exactly match the reviewed bytes before the app submits them through the selected network's client. Changing the wallet or network requires a new review; a change during signing prevents submission. Expired transactions or stale object references must be rebuilt by their source.

Base64 is an encoding, not a safety guarantee. These transactions may include arbitrary contract calls and transfers. A successful simulation does not guarantee the transaction is safe. Choose the network the transaction was built for; transactions with `ValidDuring` expiration also carry a chain identifier. Switching networks does not convert object references, gas payments or expiration constraints to another chain. No real signature or on-chain transaction was executed during development.
