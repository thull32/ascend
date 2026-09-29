// Min Cost Climbing Stairs: space-optimised DP over "cost to stand on position i".
function min_cost_climbing_stairs(cost) {
  let twoBack = 0;
  let oneBack = 0;
  for (let i = 2; i <= cost.length; i++) {
    const next = Math.min(oneBack + cost[i - 1], twoBack + cost[i - 2]);
    twoBack = oneBack;
    oneBack = next;
  }
  return oneBack;
}
