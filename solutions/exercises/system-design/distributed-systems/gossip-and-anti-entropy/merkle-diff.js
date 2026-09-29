function buildTree(leaves) {
  const levels = [leaves.slice()];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const left = prev[i], right = prev[i + 1];
      next.push((left * 1000003 + right) % 2147483647);
    }
    levels.push(next);
  }
  return levels;
}

function merkle_diff(a, b) {
  const treeA = buildTree(a);
  const treeB = buildTree(b);
  const depth = treeA.length - 1;

  let level = depth;
  let frontier = [0];
  let comparisons = 0;
  let diff = [];

  while (frontier.length > 0) {
    comparisons += frontier.length;
    if (level === 0) {
      diff = frontier.filter(idx => treeA[0][idx] !== treeB[0][idx]);
      break;
    }
    const nextFrontier = [];
    for (const idx of frontier) {
      if (treeA[level][idx] !== treeB[level][idx]) {
        nextFrontier.push(2 * idx, 2 * idx + 1);
      }
    }
    frontier = nextFrontier;
    level -= 1;
  }

  diff.sort((x, y) => x - y);
  return { diff, comparisons };
}
