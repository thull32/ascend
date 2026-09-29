// Rolling states: hold a share, just sold, or resting (able to buy).
// Every right-hand side uses yesterday's values.
function max_profit_cooldown(prices) {
  let hold = -Infinity, sold = -Infinity, rest = 0;
  for (const p of prices) {
    const newHold = Math.max(hold, rest - p);
    const newSold = hold + p;
    const newRest = Math.max(rest, sold);
    hold = newHold;
    sold = newSold;
    rest = newRest;
  }
  return Math.max(sold, rest);
}
