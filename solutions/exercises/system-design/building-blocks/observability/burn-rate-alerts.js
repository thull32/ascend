function first_alerts(budget_ppm, minutes, rules) {
  const n = minutes.length;
  const prefixTotal = new Array(n + 1).fill(0);
  const prefixErr = new Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    prefixTotal[i + 1] = prefixTotal[i] + minutes[i][0];
    prefixErr[i + 1] = prefixErr[i] + minutes[i][1];
  }

  function isBurning(end, w, burnX10) {
    const start = end - w + 1;
    if (start < 0) return false;
    const total = prefixTotal[end + 1] - prefixTotal[start];
    const errors = prefixErr[end + 1] - prefixErr[start];
    if (total <= 0) return false;
    return errors * 10000000 >= burnX10 * budget_ppm * total;
  }

  const result = [];
  for (const [longW, shortW, burnX10] of rules) {
    let fired = -1;
    for (let i = 0; i < n; i++) {
      if (isBurning(i, longW, burnX10) && isBurning(i, shortW, burnX10)) {
        fired = i;
        break;
      }
    }
    result.push(fired);
  }
  return result;
}
