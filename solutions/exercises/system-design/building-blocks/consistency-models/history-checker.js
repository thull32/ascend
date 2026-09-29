function check_history(history, model) {
  const n = history.length;
  if (n === 0) return true;

  const mustBefore = [];
  for (let j = 0; j < n; j++) mustBefore.push(new Set());
  for (let i = 0; i < n; i++) {
    const [ci, ki, vi, si, ei] = history[i];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const [cj, kj, vj, sj, ej] = history[j];
      if (model === "linearizable") {
        if (ei < sj) mustBefore[j].add(i);
      } else {
        if (ci === cj && si < sj) mustBefore[j].add(i);
      }
    }
  }

  const memo = new Map();

  function subsetOf(setA, bits) {
    for (const x of setA) {
      if (!((bits >> x) & 1)) return false;
    }
    return true;
  }

  function dfs(placedBits, value) {
    if (popcount(placedBits) === n) return true;
    const key = placedBits + "|" + value;
    if (memo.has(key)) return memo.get(key);
    let result = false;
    for (let j = 0; j < n; j++) {
      if ((placedBits >> j) & 1) continue;
      if (!subsetOf(mustBefore[j], placedBits)) continue;
      const kind = history[j][1];
      const val = history[j][2];
      if (kind === "r") {
        if (val !== value) continue;
        if (dfs(placedBits | (1 << j), value)) {
          result = true;
          break;
        }
      } else {
        if (dfs(placedBits | (1 << j), val)) {
          result = true;
          break;
        }
      }
    }
    memo.set(key, result);
    return result;
  }

  function popcount(x) {
    let c = 0;
    while (x) {
      c += x & 1;
      x >>= 1;
    }
    return c;
  }

  return dfs(0, 0);
}
