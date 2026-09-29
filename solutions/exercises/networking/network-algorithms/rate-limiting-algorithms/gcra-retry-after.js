function gcra(interval, burst, times) {
  const tau = (burst - 1) * interval;
  let tat = 0;
  const out = [];
  for (const t of times) {
    const curTat = Math.max(tat, t);
    if (curTat - t > tau) {
      out.push(curTat - tau - t);
    } else {
      out.push(0);
      tat = curTat + interval;
    }
  }
  return out;
}
