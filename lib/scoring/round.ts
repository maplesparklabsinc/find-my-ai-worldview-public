/**
 * Python's round(x, ndigits) for finite doubles: rounds the exact binary value
 * to `ndigits` decimals, ties to even. Math.round and toFixed round ties away
 * from zero, which differs on exact ties such as 0.03125, so the reference
 * vectors could disagree in the last digit without this.
 */
export function pyRound(x: number, ndigits: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const rawExp = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << BigInt(32)) | BigInt(lo);
  let exp: number;
  if (rawExp === 0) {
    exp = -1074; // subnormal
  } else {
    mantissa |= BigInt(1) << BigInt(52);
    exp = rawExp - 1075;
  }
  // |x| = mantissa * 2^exp. Scale by 10^ndigits and round to an integer.
  const ten = BigInt(10) ** BigInt(ndigits);
  let q: bigint;
  if (exp >= 0) {
    q = (mantissa << BigInt(exp)) * ten;
  } else {
    const num = mantissa * ten;
    const den = BigInt(1) << BigInt(-exp);
    q = num / den;
    const twiceRem = (num % den) * BigInt(2);
    if (twiceRem > den || (twiceRem === den && q % BigInt(2) === BigInt(1))) q += BigInt(1);
  }
  const digits = q.toString().padStart(ndigits + 1, "0");
  const text = ndigits > 0 ? `${digits.slice(0, -ndigits)}.${digits.slice(-ndigits)}` : digits;
  const result = Number(text);
  return negative ? -result : result;
}
