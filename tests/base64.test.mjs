import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transaction } from '@mysten/sui/transactions';
import { toBase64 } from '@mysten/sui/utils';
import { parseBase64Transaction, assertUnchangedBytes, submitBase64Transaction } from '../src/base64-transaction.mjs';
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
  const parsed = parseBase64Transaction(' \n'+base64+'\n',sender);
  assert.equal(parsed.base64,base64);
  assert.equal(toBase64(await parsed.tx.build()),base64);
  assert.equal(parsed.data.commands.length,2);
  assertUnchangedBytes(base64,base64);
});
test('rejects invalid input, JSON, transaction-kind-only and trailing data', async () => {
  for (const value of ['', '!!!!', '{}', 'AAAA', 'A'.repeat(180004)]) assert.throws(() => parseBase64Transaction(value,sender));
  const base64 = await fixture();
  const tx = Transaction.from(base64);
  assert.throws(() => parseBase64Transaction(base64.slice(0,-4),sender));
  const kind = await tx.build({onlyTransactionKind:true});
  assert.throws(() => parseBase64Transaction(toBase64(kind),sender));
  assert.throws(() => parseBase64Transaction(toBase64(new Uint8Array([...parseBase64Transaction(base64,sender).bytes,0])),sender));
});
test('rejects wrong sender and missing sponsor signature', async () => {
  const base64 = await fixture();
  assert.throws(() => parseBase64Transaction(base64,recipient),/sender/);
  const sponsored = await fixture(recipient);
  assert.throws(() => parseBase64Transaction(sponsored,sender),/sponsor/);
  assert.throws(() => assertUnchangedBytes(base64,sponsored),/changed/);
});

async function submissionFixture(network) {
  const base64 = await fixture();
  const calls = [];
  const response = { $kind: 'Transaction', Transaction: { digest: 'test-digest' } };
  const options = {
    base64,
    account: { address: sender, chains: [`sui:${network}`] },
    network,
    dapp: { signTransaction: async ({ transaction, account, network: signingNetwork }) => {
      calls.push('sign');
      assert.equal(signingNetwork, network);
      assert.equal(account.address, sender);
      assert.equal(toBase64(await transaction.build()), base64);
      return { bytes: base64, signature: 'test-signature' };
    } },
    kit: { getClient: selectedNetwork => {
      calls.push('client');
      assert.equal(selectedNetwork, network);
      return { executeTransaction: async ({ transaction, signatures }) => {
        calls.push('execute');
        assert.equal(toBase64(transaction), base64);
        assert.deepEqual(signatures, ['test-signature']);
        return response;
      } };
    } },
    isContextCurrent: () => true,
    onSubmitting: () => calls.push('submitting'),
  };
  return { options, calls, response };
}

for (const network of ['mainnet', 'testnet', 'devnet']) {
  test(`signs and submits unchanged bytes on the selected ${network}`, async () => {
    const { options, calls, response } = await submissionFixture(network);
    assert.equal(await submitBase64Transaction(options), response);
    assert.deepEqual(calls, ['sign', 'submitting', 'client', 'execute']);
  });
}

test('rejects a wallet that does not support the selected network before signing', async () => {
  const { options, calls } = await submissionFixture('testnet');
  options.account.chains = ['sui:mainnet'];
  await assert.rejects(submitBase64Transaction(options), /selected network/);
  assert.deepEqual(calls, []);
});

test('does not submit when the wallet or network changes during signing', async () => {
  const { options, calls } = await submissionFixture('devnet');
  let current = true;
  const sign = options.dapp.signTransaction;
  options.dapp.signTransaction = async input => {
    const signed = await sign(input);
    current = false;
    return signed;
  };
  options.isContextCurrent = () => current;
  await assert.rejects(submitBase64Transaction(options), /Wallet or network changed/);
  assert.deepEqual(calls, ['sign']);
});

test('does not submit transaction bytes changed by the wallet', async () => {
  const { options, calls } = await submissionFixture('testnet');
  options.dapp.signTransaction = async () => ({ bytes: await fixture(recipient), signature: 'test-signature' });
  await assert.rejects(submitBase64Transaction(options), /wallet changed the transaction bytes/);
  assert.deepEqual(calls, []);
});

test('does not submit if the user rejects the wallet signature', async () => {
  const { options, calls } = await submissionFixture('testnet');
  options.dapp.signTransaction = async () => { throw new Error('Signature rejected'); };
  await assert.rejects(submitBase64Transaction(options), /Signature rejected/);
  assert.deepEqual(calls, []);
});
