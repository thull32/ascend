function quorum(n) {
  return Math.floor(n / 2) + 1;
}

function satisfies(dist, cl, dc, rf) {
  const dcs = Object.keys(rf);
  const total = dcs.reduce((s, d) => s + dist[d], 0);
  const n = dcs.reduce((s, d) => s + rf[d], 0);
  if (cl === "ONE") return total >= 1;
  if (cl === "TWO") return total >= 2;
  if (cl === "QUORUM") return total >= quorum(n);
  if (cl === "LOCAL_ONE") return dist[dc] >= 1;
  if (cl === "LOCAL_QUORUM") return dist[dc] >= quorum(rf[dc]);
  if (cl === "EACH_QUORUM") return dcs.every((d) => dist[d] >= quorum(rf[d]));
  if (cl === "ALL") return total >= n;
  throw new Error(cl);
}

function validDistributions(rf, cl, dc) {
  const dcs = Object.keys(rf);
  const out = [];

  function recurse(idx, dist) {
    if (idx === dcs.length) {
      if (satisfies(dist, cl, dc, rf)) out.push({ ...dist });
      return;
    }
    const d = dcs[idx];
    for (let c = 0; c <= rf[d]; c++) {
      dist[d] = c;
      recurse(idx + 1, dist);
    }
  }

  recurse(0, {});
  return out;
}

function min_overlap(rf, write_cl, write_dc, read_cl, read_dc) {
  const writeDists = validDistributions(rf, write_cl, write_dc);
  const readDists = validDistributions(rf, read_cl, read_dc);
  const dcs = Object.keys(rf);

  let best = null;
  for (const w of writeDists) {
    for (const r of readDists) {
      let overlap = 0;
      for (const d of dcs) overlap += Math.max(0, w[d] + r[d] - rf[d]);
      if (best === null || overlap < best) best = overlap;
    }
  }
  return best;
}
