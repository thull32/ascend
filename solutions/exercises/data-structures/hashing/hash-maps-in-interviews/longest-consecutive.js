function longest_consecutive(nums) {
  const numSet = new Set(nums);
  let best = 0;
  for (const x of numSet) {
    if (!numSet.has(x - 1)) {
      let length = 1;
      while (numSet.has(x + length)) length++;
      best = Math.max(best, length);
    }
  }
  return best;
}
