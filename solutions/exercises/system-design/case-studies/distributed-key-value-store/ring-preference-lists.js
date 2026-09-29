function preference_lists(tokens, zones, keys, n) {
  const sortedTokens = tokens.slice().sort((a, b) => a[0] - b[0]);
  const m = sortedTokens.length;
  const positions = sortedTokens.map(t => t[0]);

  function bisectLeft(p) {
    let lo = 0, hi = positions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const result = [];
  for (const p of keys) {
    let start = bisectLeft(p);
    if (start === m) start = 0;

    const chosen = [];
    const usedNodes = new Set();
    const usedZones = new Set();
    for (let i = 0; i < m; i++) {
      const idx = (start + i) % m;
      const node = sortedTokens[idx][1];
      const zone = zones[node];
      if (usedNodes.has(node) || usedZones.has(zone)) continue;
      chosen.push(node);
      usedNodes.add(node);
      usedZones.add(zone);
      if (chosen.length >= n) break;
    }

    result.push(chosen);
  }

  return result;
}
