function thread_comments(rows) {
  const result = [];
  const roots = new Map();

  for (const row of rows) {
    if (row.parent_id === null) {
      const entry = [row.id, []];
      roots.set(row.id, entry);
      result.push(entry);
    }
  }

  for (const row of rows) {
    const pid = row.parent_id;
    if (pid !== null && roots.has(pid)) {
      roots.get(pid)[1].push(row.id);
    }
  }

  return result;
}
