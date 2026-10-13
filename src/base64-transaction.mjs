import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { fromBase64, toBase64, normalizeSuiAddress } from '@mysten/sui/utils';

export function parseBase64Transaction(input, address, network) {
  if (network !== 'mainnet') throw new Error('Base64 transactions can only be submitted on Mainnet. Switch to Sui Mainnet first.');
  const base64 = input.replace(/\s/g, '');
  if (!base64 || base64.length > 180000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64)) {
    throw new Error('Paste valid Base64 from toBase64(await tx.build({ client })).');
  }
  let tx, bytes;
  try {
    bytes = fromBase64(base64);
    // Require complete TransactionData, not TransactionKind, JSON, signatures or trailing bytes.
    const decoded = bcs.TransactionData.parse(bytes);
    if (toBase64(bcs.TransactionData.serialize(decoded).toBytes()) !== base64) throw new Error('Non-canonical transaction');
    tx = Transaction.from(bytes);
  } catch {
    throw new Error('Invalid transaction bytes. Use the full output of tx.build({ client }), not onlyTransactionKind.');
  }
  const data = tx.getData();
  if (!data.sender || normalizeSuiAddress(data.sender) !== normalizeSuiAddress(address)) throw new Error('The transaction sender must match the connected wallet.');
  if (!data.gasData.owner || normalizeSuiAddress(data.gasData.owner) !== normalizeSuiAddress(address)) throw new Error('Sponsored transactions require a separate sponsor signature and are not supported here.');
  if (!data.commands.length) throw new Error('The transaction contains no commands.');
  return { tx, bytes, base64, data };
}

export function assertUnchangedBytes(expected, signed) {
  if (toBase64(fromBase64(signed)) !== expected) throw new Error('The wallet changed the transaction bytes. Nothing was submitted. Please rebuild and review the transaction.');
}
