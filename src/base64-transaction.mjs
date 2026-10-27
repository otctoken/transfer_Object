import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { fromBase64, toBase64, normalizeSuiAddress } from '@mysten/sui/utils';

export function normalizeBase64Input(input) {
  let text = input.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').trim();
  const fenced = text.match(/^```(?:base64|text|txt)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i);
  if (fenced) text = fenced[1].trim();
  if (text.length >= 2 && ['"', "'", '`'].includes(text[0]) && text.at(-1) === text[0]) text = text.slice(1, -1);
  let base64 = text.replace(/\s/g, '');
  if (!base64) throw new Error('Paste the complete Base64 transaction or import its text file.');
  if (base64.length > 180000) throw new Error(`Transaction text is too large (${base64.length} characters; maximum 180000).`);
  const invalid = /[^A-Za-z0-9+/=]/u.exec(base64);
  if (invalid) throw new Error(`Invalid Base64 character ${JSON.stringify(invalid[0])} (U+${invalid[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}) at position ${invalid.index + 1}. Copy only the transaction bytes, or import the original text file.`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1 || (base64.includes('=') && base64.length % 4 !== 0)) {
    throw new Error('Base64 is truncated or has invalid padding. Copy the complete transaction or import the original text file.');
  }
  // Restore omitted trailing padding without changing any transaction bytes.
  base64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  if (toBase64(fromBase64(base64)) !== base64) throw new Error('Base64 has invalid padding bits. Import the original transaction text file.');
  return base64;
}

export function parseBase64Transaction(input, address) {
  const base64 = normalizeBase64Input(input);
  let tx, bytes;
  try {
    bytes = fromBase64(base64);
    // Require complete TransactionData, not TransactionKind, JSON, signatures or trailing bytes.
    const decoded = bcs.TransactionData.parse(bytes);
    if (toBase64(bcs.TransactionData.serialize(decoded).toBytes()) !== base64) throw new Error('Non-canonical transaction');
    tx = Transaction.from(bytes);
  } catch {
    throw new Error('Base64 decoded, but is not complete Sui TransactionData. Use sui client publish --serialize-unsigned-transaction or toBase64(await tx.build({ client })), not onlyTransactionKind, module bytecode or signed transaction data.');
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
