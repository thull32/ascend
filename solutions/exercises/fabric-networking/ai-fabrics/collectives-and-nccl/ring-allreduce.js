// Ring all-reduce as NCCL's ring runs it: reduce-scatter, then all-gather, counting elements sent.

function ring_allreduce(vectors) {
  const n = vectors.length;
  const length = vectors[0].length;
  const buf = vectors.map((v) => [...v]);
  const bounds = [];
  for (let c = 0; c < n; c++) bounds.push([Math.floor((c * length) / n), Math.floor(((c + 1) * length) / n)]);
  const sent = new Array(n).fill(0);
  const mod = (a) => ((a % n) + n) % n;

  const transfer = (phase, k) => {
    for (let r = 0; r < n; r++) {
      const c = phase === "rs" ? mod(r - k) : mod(r + 1 - k);
      const [lo, hi] = bounds[c];
      const dst = (r + 1) % n;
      for (let i = lo; i < hi; i++) {
        buf[dst][i] = phase === "rs" ? buf[dst][i] + buf[r][i] : buf[r][i];
      }
      sent[r] += hi - lo;
    }
  };

  for (let k = 0; k < n - 1; k++) transfer("rs", k);
  for (let k = 0; k < n - 1; k++) transfer("ag", k);
  return { result: buf, elements_sent: sent, steps: 2 * (n - 1) };
}
