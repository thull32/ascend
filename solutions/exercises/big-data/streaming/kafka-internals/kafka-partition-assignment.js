function assign_partitions(strategy, consumers, topics) {
  const members = [...consumers].sort();
  const result = {};
  for (const c of members) result[c] = [];
  const C = members.length;
  if (C === 0) return result;

  if (strategy === "range") {
    for (const topic of Object.keys(topics).sort()) {
      const P = topics[topic];
      const base = Math.floor(P / C);
      const extra = P % C;
      let start = 0;
      for (let i = 0; i < members.length; i++) {
        const count = base + (i < extra ? 1 : 0);
        for (let p = start; p < start + count; p++) {
          result[members[i]].push(`${topic}-${p}`);
        }
        start += count;
      }
    }
  } else {
    const tps = [];
    for (const topic of Object.keys(topics).sort()) {
      for (let p = 0; p < topics[topic]; p++) tps.push(`${topic}-${p}`);
    }
    for (let j = 0; j < tps.length; j++) {
      result[members[j % C]].push(tps[j]);
    }
  }

  return result;
}
