// Pacific Atlantic Water Flow: reverse multi-source search "uphill" from each ocean's border.
function pacific_atlantic(heights) {
  if (!heights || heights.length === 0 || heights[0].length === 0) {
    return [];
  }
  const rows = heights.length;
  const cols = heights[0].length;

  function climb(seeds) {
    const seen = new Set();
    const stack = [];
    for (const [r, c] of seeds) {
      const key = r * cols + c;
      if (!seen.has(key)) {
        seen.add(key);
        stack.push([r, c]);
      }
    }
    while (stack.length > 0) {
      const [r, c] = stack.pop();
      const neighbors = [
        [r + 1, c],
        [r - 1, c],
        [r, c + 1],
        [r, c - 1],
      ];
      for (const [nr, nc] of neighbors) {
        if (
          nr >= 0 &&
          nr < rows &&
          nc >= 0 &&
          nc < cols &&
          heights[nr][nc] >= heights[r][c]
        ) {
          const key = nr * cols + nc;
          if (!seen.has(key)) {
            seen.add(key);
            stack.push([nr, nc]);
          }
        }
      }
    }
    return seen;
  }

  const pacificSeeds = [];
  for (let c = 0; c < cols; c++) pacificSeeds.push([0, c]);
  for (let r = 0; r < rows; r++) pacificSeeds.push([r, 0]);

  const atlanticSeeds = [];
  for (let c = 0; c < cols; c++) atlanticSeeds.push([rows - 1, c]);
  for (let r = 0; r < rows; r++) atlanticSeeds.push([r, cols - 1]);

  const pacific = climb(pacificSeeds);
  const atlantic = climb(atlanticSeeds);

  const result = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = r * cols + c;
      if (pacific.has(key) && atlantic.has(key)) {
        result.push([r, c]);
      }
    }
  }
  return result;
}
