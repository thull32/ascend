function range_min_queries(values, queries) {
  const n = values.length;
  const log = new Array(n + 1).fill(0);
  for (let i = 2; i <= n; i++) log[i] = log[Math.floor(i / 2)] + 1;

  const st = [values.slice()];
  let k = 1;
  while ((1 << k) <= n) {
    const prev = st[st.length - 1];
    const half = 1 << (k - 1);
    const length = n - (1 << k) + 1;
    const row = new Array(length);
    for (let i = 0; i < length; i++) {
      row[i] = Math.min(prev[i], prev[i + half]);
    }
    st.push(row);
    k += 1;
  }

  const out = [];
  for (const [l, r] of queries) {
    const length = r - l + 1;
    const kk = log[length];
    out.push(Math.min(st[kk][l], st[kk][r - (1 << kk) + 1]));
  }
  return out;
}
