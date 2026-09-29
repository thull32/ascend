// Bottom-up DP: fewest[a] is the fewest coins that make amount a.
function coin_change(coins, amount) {
  const INF = amount + 1; // more coins than any real answer can use
  const fewest = new Array(amount + 1).fill(INF);
  fewest[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && fewest[a - c] + 1 < fewest[a]) fewest[a] = fewest[a - c] + 1;
    }
  }
  return fewest[amount] !== INF ? fewest[amount] : -1;
}
