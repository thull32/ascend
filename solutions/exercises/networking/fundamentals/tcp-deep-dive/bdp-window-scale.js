function window_for_bdp(bandwidth_mbps, rtt_ms) {
  const bdp = bandwidth_mbps * rtt_ms * 125;

  let shift = 0;
  while (shift < 14 && 65535 * 2 ** shift < bdp) {
    shift += 1;
  }

  return [bdp, shift];
}
