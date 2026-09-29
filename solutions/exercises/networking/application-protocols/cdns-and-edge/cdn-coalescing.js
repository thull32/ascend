// Count origin fetches with and without request coalescing.

function origin_fetches(times, fetch_ms, ttl_ms, coalesce) {
  const starts = []; // start time of every fetch sent to the origin
  for (const t of times) {
    const fresh = starts.some((s) => s + fetch_ms <= t && t < s + fetch_ms + ttl_ms);
    if (fresh) continue;
    const inFlight = coalesce && starts.some((s) => s <= t && t < s + fetch_ms);
    if (inFlight) continue;
    starts.push(t);
  }
  return starts.length;
}
