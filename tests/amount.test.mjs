import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatAmount } from '../src/amount.mjs';
test('precision survives large integer and fractional values', () => { assert.equal(parseAmount('9007199254.740993001',9),9007199254740993001n); assert.equal(parseAmount('0.000000001',9),1n); assert.equal(parseAmount('1',0),1n); });
test('invalid, excessive precision and overflow are rejected', () => { for (const x of ['0','-1','1e3','NaN','1.0000000001','18446744073709551616']) assert.throws(() => parseAmount(x,9)); assert.throws(() => parseAmount('1.1',0)); });
test('format is exact with trailing zeros and integer decimals', () => { assert.equal(formatAmount('1000000000',9),'1'); assert.equal(formatAmount('100000000',9),'0.1'); assert.equal(formatAmount('0',9),'0'); assert.equal(formatAmount('100',0),'100'); assert.equal(formatAmount('100000000000',9),'100'); });
