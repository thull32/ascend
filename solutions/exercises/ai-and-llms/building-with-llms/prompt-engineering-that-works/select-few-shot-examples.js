function select_examples(pool, query, k) {
  const scored = pool.map((item) => {
    let score = 0;
    for (let i = 0; i < item.vec.length; i++) score += item.vec[i] * query[i];
    return { score, id: item.id, item };
  });

  const ranked = scored.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id - b.id;
  });

  const chosenIds = [];
  const positions = new Map();
  const seenLabels = new Set();
  for (let pos = 0; pos < ranked.length; pos++) {
    if (chosenIds.length >= k) break;
    const { id, item } = ranked[pos];
    if (!seenLabels.has(item.label)) {
      seenLabels.add(item.label);
      chosenIds.push(id);
      positions.set(id, pos);
    }
  }

  if (chosenIds.length < k) {
    const chosenSet = new Set(chosenIds);
    for (let pos = 0; pos < ranked.length; pos++) {
      if (chosenIds.length >= k) break;
      const { id } = ranked[pos];
      if (!chosenSet.has(id)) {
        chosenIds.push(id);
        positions.set(id, pos);
        chosenSet.add(id);
      }
    }
  }

  chosenIds.sort((a, b) => positions.get(b) - positions.get(a));
  return chosenIds;
}
