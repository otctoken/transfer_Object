import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { fromBase64, toBase64, normalizeSuiAddress } from '@mysten/sui/utils';

export function parseBase64Transaction(input, address) {
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

export async function submitBase64Transaction({ base64, account, network, dapp, kit, isContextCurrent, onSubmitting }) {
  if (!account.chains.includes(`sui:${network}`)) throw new Error('This wallet account does not support the selected network.');
  const parsed = parseBase64Transaction(base64, account.address);
  const signed = await dapp.signTransaction({ transaction: parsed.tx, account, network });
  assertUnchangedBytes(parsed.base64, signed.bytes);
  if (!isContextCurrent()) throw new Error('Wallet or network changed. Nothing was submitted.');
  onSubmitting();
  return kit.getClient(network).executeTransaction({ transaction: parsed.bytes, signatures: [signed.signature] });
}
