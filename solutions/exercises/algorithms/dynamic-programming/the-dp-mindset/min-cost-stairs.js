function min_cost_climbing(cost) {
  let prev2 = 0, prev1 = 0;
  for (let i = 0; i < cost.length; i++) {
    const cur = cost[i] + Math.min(prev1, prev2);
    prev2 = prev1;
    prev1 = cur;
  }
  return Math.min(prev1, prev2);
}
