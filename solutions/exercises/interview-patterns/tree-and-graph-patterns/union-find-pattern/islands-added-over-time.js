function num_islands_online(rows, cols, positions) {
  const parent = new Map();

  function find(x) {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  }

  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra === rb) return false;
    parent.set(ra, rb);
    return true;
  }

  const result = [];
  let count = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [r, c] of positions) {
    const key = r * cols + c;
    if (parent.has(key)) {
      result.push(count);
      continue;
    }
    parent.set(key, key);
    count += 1;
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        const nkey = nr * cols + nc;
        if (parent.has(nkey) && union(key, nkey)) count -= 1;
      }
    }
    result.push(count);
  }
  return result;
}
