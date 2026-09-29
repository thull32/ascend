function index_provides_sort(index, equality, sort) {
  const equalitySet = new Set(equality);
  const remaining = sort.filter(([f]) => !equalitySet.has(f));
  if (remaining.length === 0) return true;

  const indexFields = index.map((c) => c[0]);
  const firstField = remaining[0][0];
  const p = indexFields.indexOf(firstField);
  if (p === -1) return false;

  for (let i = 0; i < p; i++) {
    if (!equalitySet.has(index[i][0])) return false;
  }

  const n = remaining.length;
  if (p + n > index.length) return false;

  const matching = index.slice(p, p + n);
  for (let i = 0; i < n; i++) {
    if (remaining[i][0] !== matching[i][0]) return false;
  }

  const same = remaining.every((r, i) => r[1] === matching[i][1]);
  const opposite = remaining.every((r, i) => r[1] === -matching[i][1]);
  return same || opposite;
}
