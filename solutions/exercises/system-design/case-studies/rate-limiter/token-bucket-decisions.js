function token_bucket(capacity, rate, times) {
  let tokens = capacity;
  let last = 0;
  const out = [];
  for (const t of times) {
    tokens = Math.min(capacity, tokens + (t - last) * rate);
    last = t;
    if (tokens >= 1) {
      tokens -= 1;
      out.push(true);
    } else {
      out.push(false);
    }
  }
  return out;
}
