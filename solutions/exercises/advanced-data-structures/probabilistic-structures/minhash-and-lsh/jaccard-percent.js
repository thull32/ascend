function jaccard_percent(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const union = new Set([...sa, ...sb]);
  if (union.size === 0) return 100;
  let interSize = 0;
  for (const x of sa) if (sb.has(x)) interSize += 1;
  return Math.round((100 * interSize) / union.size);
}
