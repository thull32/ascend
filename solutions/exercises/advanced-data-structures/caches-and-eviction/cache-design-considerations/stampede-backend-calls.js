function backend_calls(arrivals, expiry, latency, coalesce) {
  let refill = null;
  let calls = 0;
  const sorted = [...arrivals].sort((a, b) => a - b);
  for (const t of sorted) {
    if (refill !== null && t >= refill) continue; // hit, cache has been refilled
    if (t < expiry) continue; // hit, original entry still valid
    // miss
    if (refill === null) {
      refill = t + latency;
      calls += 1;
    } else if (!coalesce) {
      calls += 1;
    }
  }
  return calls;
}
