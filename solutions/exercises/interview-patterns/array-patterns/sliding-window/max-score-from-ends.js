function max_score_from_ends(cards, k) {
  const n = cards.length;
  const total = cards.reduce((a, b) => a + b, 0);
  if (k === 0) return 0;
  const window = n - k;
  if (window === 0) return total;
  let current = 0;
  for (let i = 0; i < window; i++) current += cards[i];
  let minWindow = current;
  for (let i = window; i < n; i++) {
    current += cards[i] - cards[i - window];
    minWindow = Math.min(minWindow, current);
  }
  return total - minWindow;
}
