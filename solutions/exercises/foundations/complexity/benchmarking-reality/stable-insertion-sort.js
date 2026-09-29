function _key(v) {
  return Array.isArray(v) ? v[0] : v;
}

function insertion_sort(nums) {
  const out = nums.slice();
  for (let i = 1; i < out.length; i++) {
    const x = out[i];
    const xk = _key(x);
    let j = i - 1;
    while (j >= 0 && _key(out[j]) > xk) {
      out[j + 1] = out[j];
      j -= 1;
    }
    out[j + 1] = x;
  }
  return out;
}
