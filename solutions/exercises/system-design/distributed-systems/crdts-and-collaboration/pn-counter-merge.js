function pn_counter_value(states) {
  const mergedP = {};
  const mergedN = {};

  for (const state of states) {
    const p = state.p || {};
    const n = state.n || {};
    for (const rid of Object.keys(p)) {
      if (!(rid in mergedP) || p[rid] > mergedP[rid]) mergedP[rid] = p[rid];
    }
    for (const rid of Object.keys(n)) {
      if (!(rid in mergedN) || n[rid] > mergedN[rid]) mergedN[rid] = n[rid];
    }
  }

  const sumP = Object.values(mergedP).reduce((a, b) => a + b, 0);
  const sumN = Object.values(mergedN).reduce((a, b) => a + b, 0);
  return sumP - sumN;
}
