function repair_follower(leader, follower) {
  let nextIndex = leader.length + 1;
  const probes = [];
  let prev;

  while (true) {
    prev = nextIndex - 1;
    const prevTerm = prev > 0 ? leader[prev - 1] : 0;
    probes.push(prev);
    if (prev === 0 || (prev <= follower.length && follower[prev - 1] === prevTerm)) {
      break;
    }
    nextIndex -= 1;
  }

  let result = follower.slice();
  let truncated = 0;

  const tail = leader.slice(prev);
  for (let offset = 1; offset <= tail.length; offset++) {
    const term = tail[offset - 1];
    const pos = prev + offset - 1;
    if (pos < result.length) {
      if (result[pos] === term) continue;
      truncated = result.length - pos;
      result = result.slice(0, pos);
      result.push(term);
    } else {
      result.push(term);
    }
  }

  return { probes, truncated, log: result };
}
