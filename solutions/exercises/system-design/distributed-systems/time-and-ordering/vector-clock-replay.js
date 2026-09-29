function vector_clocks(n, events, queries) {
  const procVec = [];
  for (let i = 0; i < n; i++) procVec.push(new Array(n).fill(0));
  const msgs = {};
  const clocks = [];

  for (const ev of events) {
    const kind = ev[0];
    if (kind === "local") {
      const p = ev[1];
      procVec[p][p] += 1;
      clocks.push(procVec[p].slice());
    } else if (kind === "send") {
      const p = ev[1], msg = ev[2];
      procVec[p][p] += 1;
      msgs[msg] = procVec[p].slice();
      clocks.push(procVec[p].slice());
    } else {
      const p = ev[1], msg = ev[2];
      const carried = msgs[msg];
      procVec[p] = procVec[p].map((v, idx) => Math.max(v, carried[idx]));
      procVec[p][p] += 1;
      clocks.push(procVec[p].slice());
    }
  }

  function dominates(a, b) {
    return a.every((x, idx) => x <= b[idx]);
  }

  function eq(a, b) {
    return a.every((x, idx) => x === b[idx]);
  }

  const relations = [];
  for (const [i, j] of queries) {
    const a = clocks[i], b = clocks[j];
    if (eq(a, b)) relations.push("equal");
    else if (dominates(a, b)) relations.push("before");
    else if (dominates(b, a)) relations.push("after");
    else relations.push("concurrent");
  }

  return { clocks, relations };
}
