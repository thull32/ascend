// Keyset pagination with an opaque base64 cursor.

function keyset_page(rows, limit, cursor) {
  const ordered = [...rows].sort((a, b) => (b[0] - a[0]) || (b[1] - a[1]));

  let after = null;
  if (cursor !== null && cursor !== undefined) {
    const decoded = atob(cursor);
    const idx = decoded.indexOf(",");
    const createdAt = parseInt(decoded.slice(0, idx), 10);
    const id = parseInt(decoded.slice(idx + 1), 10);
    after = [createdAt, id];
  }

  let remaining = ordered;
  if (after !== null) {
    remaining = ordered.filter(
      (r) => r[0] < after[0] || (r[0] === after[0] && r[1] < after[1])
    );
  }

  const page = remaining.slice(0, limit);
  const hasNext = remaining.length > limit;

  const ids = page.map((r) => r[1]);
  let nextCursor = null;
  if (page.length > 0 && hasNext) {
    const last = page[page.length - 1];
    nextCursor = btoa(`${last[0]},${last[1]}`);
  }

  return { ids, next: nextCursor };
}
