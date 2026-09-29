function global_top_k(shard_results, k) {
  const allRows = [];
  for (const shard of shard_results) {
    for (const row of shard) allRows.push(row);
  }

  const fetched = allRows.length;
  allRows.sort((a, b) => (b[0] - a[0]) || (b[1] < a[1] ? -1 : b[1] > a[1] ? 1 : 0));
  const top = allRows.slice(0, k);
  const ids = top.map((r) => r[1]);

  return { ids, fetched, discarded: fetched - ids.length };
}
