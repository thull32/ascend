function go_back_n(n, window, lost) {
  const lostSet = new Set(lost);
  let base = 0;
  let nextSeq = 0;
  let expected = 0;
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
      if (!isLost && seq === expected) {
        expected += 1;
        base = expected;
      }
    }

    if (!pipe.length && base < nextSeq) {
      nextSeq = base;
    }
  }

  return log;
}
