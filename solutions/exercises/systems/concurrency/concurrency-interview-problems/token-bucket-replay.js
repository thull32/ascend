function token_bucket(capacity, refill_ms, times) {
  let tokens = capacity;
  let last = 0;
  const result = [];
  for (const t of times) {
    const added = Math.floor(t / refill_ms) - Math.floor(last / refill_ms);
    tokens = Math.min(capacity, tokens + added);
    last = t;
    if (tokens > 0) {
      tokens -= 1;
      result.push(true);
    } else {
      result.push(false);
    }
  }
  return result;
}
