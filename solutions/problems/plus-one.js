// Plus One: increment following the carry, right to left, without converting to an integer.
function plus_one(digits) {
  const out = digits.slice();
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i] < 9) {
      out[i] += 1;
      return out;
    }
    out[i] = 0;
  }
  return [1, ...out];
}
