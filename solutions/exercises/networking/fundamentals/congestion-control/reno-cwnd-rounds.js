function reno_cwnd(initial_cwnd, ssthresh, events) {
  let cwnd = initial_cwnd;
  const out = [];

  for (const event of events) {
    out.push(cwnd);

    if (event === ".") {
      if (cwnd < ssthresh) {
        cwnd = Math.min(2 * cwnd, ssthresh);
      } else {
        cwnd = cwnd + 1;
      }
    } else if (event === "D") {
      ssthresh = Math.max(Math.floor(cwnd / 2), 2);
      cwnd = ssthresh;
    } else if (event === "T") {
      ssthresh = Math.max(Math.floor(cwnd / 2), 2);
      cwnd = 1;
    }
  }

  return out;
}
