function count_decodings(s) {
  const n = s.length;
  const memo = new Map();

  function frm(i) {
    if (i === n) return 1;
    if (memo.has(i)) return memo.get(i);
    let total = 0;
    if (s[i] !== '0') {
      total += frm(i + 1);
      if (i + 1 < n) {
        const two = Number(s.slice(i, i + 2));
        if (two >= 10 && two <= 26) total += frm(i + 2);
      }
    }
    memo.set(i, total);
    return total;
  }

  return frm(0);
}
