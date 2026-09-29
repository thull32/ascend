function find_write_skew(schedule) {
  const firstOp = new Map();
  const commitIdx = new Map();
  const reads = new Map();
  const writes = new Map();

  for (let i = 0; i < schedule.length; i++) {
    const op = schedule[i];
    const txn = op[0];
    if (!firstOp.has(txn)) {
      firstOp.set(txn, i);
      reads.set(txn, new Set());
      writes.set(txn, new Set());
    }
    if (op[1] === "r") {
      reads.get(txn).add(op[2]);
    } else if (op[1] === "w") {
      writes.get(txn).add(op[2]);
    } else if (op[1] === "c") {
      commitIdx.set(txn, i);
    }
  }

  const txns = [...firstOp.keys()].sort();
  const result = [];
  for (let i = 0; i < txns.length; i++) {
    for (let j = i + 1; j < txns.length; j++) {
      let a = txns[i];
      let b = txns[j];
      if (a > b) [a, b] = [b, a];
      const concurrent = firstOp.get(a) < commitIdx.get(b) && firstOp.get(b) < commitIdx.get(a);
      if (!concurrent) continue;
      const writeOverlap = [...writes.get(a)].some((x) => writes.get(b).has(x));
      if (writeOverlap) continue;
      const aReadsBWrites = [...reads.get(a)].some((x) => writes.get(b).has(x));
      const bReadsAWrites = [...reads.get(b)].some((x) => writes.get(a).has(x));
      if (aReadsBWrites && bReadsAWrites) result.push([a, b]);
    }
  }

  result.sort((p, q) => (p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[1] < q[1] ? -1 : p[1] > q[1] ? 1 : 0));
  return result;
}
