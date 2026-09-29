function selective_repeat(n, window, lost) {
  const lostSet = new Set(lost);
  let base = 0;
  let nextSeq = 0;
  const acked = new Set();
  const log = [];
  const pipe = [];

  while (base < n) {
    while (nextSeq < Math.min(base + window, n)) {
      const pos = log.length;
      log.push(nextSeq);
      pipe.push([nextSeq, lostSet.has(pos)]);
      nextSeq += 1;
    }

    if (pipe.length) {
      const [seq, isLost] = pipe.shift();
      if (!isLost) {
        acked.add(seq);
        while (acked.has(base)) base += 1;
      }
    }

    if (!pipe.length && base < nextSeq) {
      for (let s = base; s < nextSeq; s++) {
        if (!acked.has(s)) {
          const pos = log.length;
          log.push(s);
          pipe.push([s, lostSet.has(pos)]);
        }
      }
    }
  }

  return log;
}
