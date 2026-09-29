// DP: bits(i) = bits(i >> 1) + (i & 1), each entry O(1) from a smaller one.
function count_bits(n) {
  const ans = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    ans[i] = ans[i >> 1] + (i & 1);
  }
  return ans;
}
