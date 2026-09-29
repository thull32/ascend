function longest_balanced(bits) {
  const firstIndex = new Map([[0, 0]]);
  let prefix = 0;
  let best = 0;
  for (let j = 0; j < bits.length; j++) {
    prefix += bits[j] === 1 ? 1 : -1;
    if (firstIndex.has(prefix)) {
      best = Math.max(best, (j + 1) - firstIndex.get(prefix));
    } else {
      firstIndex.set(prefix, j + 1);
    }
  }
  return best;
}
