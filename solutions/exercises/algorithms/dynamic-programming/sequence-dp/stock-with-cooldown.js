function max_profit_cooldown(prices) {
  let hold = -Infinity, sold = -Infinity, free = 0;
  for (const p of prices) {
    const newHold = Math.max(hold, free - p);
    const newSold = hold + p;
    const newFree = Math.max(free, sold);
    hold = newHold;
    sold = newSold;
    free = newFree;
  }
  return prices.length ? Math.max(free, sold) : 0;
}
