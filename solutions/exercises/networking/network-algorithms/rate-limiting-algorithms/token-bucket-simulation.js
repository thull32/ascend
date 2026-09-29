function token_bucket(capacity, rate, times) {
  let tokens = capacity;
  let last = times.length ? times[0] : 0;
  const result = [];
  for (const t of times) {
    tokens = Math.min(capacity, tokens + (t - last) * rate);
    last = t;
    if (tokens >= 1) {
      tokens -= 1;
      result.push(true);
    } else {
      result.push(false);
    }
  }
  return result;
}
