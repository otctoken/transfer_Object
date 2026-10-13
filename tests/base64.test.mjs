import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { parseBase64Transaction, assertUnchangedBytes } from '../src/base64-transaction.mjs';
const sender = '0x' + '1'.repeat(64);
const recipient = '0x' + '2'.repeat(64);
async function fixture(owner = sender) {
  const tx = new Transaction();
  tx.setSender(sender); tx.setGasOwner(owner); tx.setGasBudget(10000000); tx.setGasPrice(1000);
  tx.setGasPayment([{objectId:'0x'+'3'.repeat(64),version:'1',digest:'11111111111111111111111111111111'}]);
  const [coin] = tx.splitCoins(tx.gas,[tx.pure.u64(1000)]);
  tx.transferObjects([coin],recipient);
  return toBase64(await tx.build());
}
test('parses full bytes, tolerates whitespace and preserves the transaction exactly', async () => {
  const base64 = await fixture();
  const parsed = parseBase64Transaction(' \n'+base64+'\n',sender,'mainnet');
  assert.equal(parsed.base64,base64);
  assert.equal(toBase64(await parsed.tx.build()),base64);
  assert.equal(parsed.data.commands.length,2);
  assertUnchangedBytes(base64,base64);
});
test('rejects invalid input, JSON, transaction-kind-only and trailing data', async () => {
  for (const value of ['', '!!!!', '{}', 'AAAA', 'A'.repeat(180004)]) assert.throws(() => parseBase64Transaction(value,sender,'mainnet'));
  const base64 = await fixture();
  const tx = Transaction.from(base64);
  assert.throws(() => parseBase64Transaction(base64.slice(0,-4),sender,'mainnet'));
  const kind = await tx.build({onlyTransactionKind:true});
  assert.throws(() => parseBase64Transaction(toBase64(kind),sender,'mainnet'));
  assert.throws(() => parseBase64Transaction(toBase64(new Uint8Array([...parseBase64Transaction(base64,sender,'mainnet').bytes,0])),sender,'mainnet'));
});
test('rejects wrong network, sender and missing sponsor signature', async () => {
  const base64 = await fixture();
  assert.throws(() => parseBase64Transaction(base64,sender,'testnet'),/Mainnet/);
  assert.throws(() => parseBase64Transaction(base64,recipient,'mainnet'),/sender/);
  const sponsored = await fixture(recipient);
  assert.throws(() => parseBase64Transaction(sponsored,sender,'mainnet'),/sponsor/);
  assert.throws(() => assertUnchangedBytes(base64,sponsored),/changed/);
});
