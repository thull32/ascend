function paxos(n_acceptors, values, schedule) {
  const promised = new Array(n_acceptors).fill(0);
  const accepted = Array.from({ length: n_acceptors }, () => [0, null]);
  let chosen = null;
  const promises = new Map();
  const majority = Math.floor(n_acceptors / 2) + 1;

  for (const [kind, proposer, n, targets] of schedule) {
    const key = proposer + "|" + n;
    if (kind === "prepare") {
      if (!promises.has(key)) promises.set(key, []);
      const lst = promises.get(key);
      for (const a of targets) {
        if (n > promised[a]) {
          promised[a] = n;
          lst.push([accepted[a][0], accepted[a][1]]);
        }
      }
    } else {
      const lst = promises.get(key) || [];
      if (lst.length < majority) continue;

      let bestNum = 0;
      let bestVal = null;
      for (const [num, val] of lst) {
        if (num > bestNum) {
          bestNum = num;
          bestVal = val;
        }
      }
      const value = bestNum > 0 ? bestVal : values[proposer];

      for (const a of targets) {
        if (n >= promised[a]) {
          promised[a] = n;
          accepted[a] = [n, value];
        }
      }

      if (chosen === null) {
        let count = 0;
        for (let a = 0; a < n_acceptors; a++) {
          if (accepted[a][0] === n) count += 1;
        }
        if (count >= majority) chosen = value;
      }
    }
  }

  const acceptors = [];
  for (let a = 0; a < n_acceptors; a++) {
    acceptors.push([promised[a], accepted[a][0], accepted[a][1]]);
  }
  return { chosen, acceptors };
}
