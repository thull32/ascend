// Fibonacci-style rolling recurrence: ways[i] = ways[i-1] + ways[i-2].
function climbing_stairs(n) {
  let prev2 = 1, prev1 = 1; // ways[i-2], ways[i-1], starting at i = 2
  for (let i = 2; i <= n; i++) {
    [prev2, prev1] = [prev1, prev1 + prev2];
  }
  return prev1;
}
