export function parseAmount(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('代币精度无效');
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error('请输入有效的正数，不支持科学计数法');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`最多支持 ${decimals} 位小数`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n) throw new Error('数量必须大于 0');
  if (units > 18446744073709551615n) throw new Error('数量超过单笔 u64 上限');
  return units;
}
export function formatAmount(value, decimals) {
  const raw = BigInt(value).toString().padStart(decimals + 1, '0');
  if (!decimals) return raw;
  return `${raw.slice(0, -decimals)}.${raw.slice(-decimals)}`.replace(/\.?0+$/, '');
}
