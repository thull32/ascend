function slow_start_rounds(nbytes, mss, initcwnd, max_cwnd) {
  if (nbytes === 0) return 0;
  const segments = Math.ceil(nbytes / mss);
  let cwnd = Math.min(initcwnd, max_cwnd);
  let sent = 0;
  let rounds = 0;
  while (sent < segments) {
    sent += cwnd;
    rounds += 1;
    cwnd = Math.min(2 * cwnd, max_cwnd);
  }
  return rounds;
}
