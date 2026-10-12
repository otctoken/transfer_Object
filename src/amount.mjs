export function parseAmount(value, decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Invalid token decimals');
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error('Enter a positive decimal amount without scientific notation');
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`Use no more than ${decimals} decimal places`);
  const units = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (units <= 0n) throw new Error('Amount must be greater than zero');
  if (units > 18446744073709551615n) throw new Error('Amount exceeds the u64 limit');
  return units;
}
export function formatAmount(value, decimals) {
  const raw = BigInt(value).toString().padStart(decimals + 1, '0');
  if (!decimals) return raw;
  return `${raw.slice(0, -decimals)}.${raw.slice(-decimals)}`.replace(/\.?0+$/, '');
}
