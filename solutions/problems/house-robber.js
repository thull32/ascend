// Rolling DP: best[i] = max(skip house i, rob house i + best[i-2]).
function rob(nums) {
  let twoBack = 0, oneBack = 0; // best[i-2], best[i-1]
  for (const x of nums) {
    [twoBack, oneBack] = [oneBack, Math.max(oneBack, twoBack + x)];
  }
  return oneBack;
}
