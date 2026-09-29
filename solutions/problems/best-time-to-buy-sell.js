// Track the lowest price seen so far and the best profit achievable selling today.
function max_profit(prices) {
  let best = 0;
  let lowest = Infinity;
  for (const p of prices) {
    if (p < lowest) {
      lowest = p;
    } else if (p - lowest > best) {
      best = p - lowest;
    }
  }
  return best;
}
