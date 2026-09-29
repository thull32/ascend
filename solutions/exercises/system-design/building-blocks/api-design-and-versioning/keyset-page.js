function keyset_page(rows, limit, cursor) {
  let ordered = rows.slice().sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  if (cursor !== null) {
    const [cCreated, cId] = cursor;
    ordered = ordered.filter(r => (r[1] < cCreated) || (r[1] === cCreated && r[0] < cId));
  }

  const page = ordered.slice(0, limit + 1);
  const hasMore = page.length > limit;
  const trimmed = page.slice(0, limit);

  const ids = trimmed.map(r => r[0]);
  const next = hasMore ? [trimmed[trimmed.length - 1][1], trimmed[trimmed.length - 1][0]] : null;

  return { ids, next };
}
