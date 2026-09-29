// Longest Consecutive Sequence — hash set, walk only from the start of each run.
function longest_consecutive(nums) {
  const values = new Set(nums);
  let best = 0;
  for (const x of values) {
    if (values.has(x - 1)) continue; // not the start of a run
    let length = 1;
    while (values.has(x + length)) length += 1;
    best = Math.max(best, length);
  }
  return best;
}
