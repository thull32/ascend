// Backtrack over sorted candidates; each is used at most once (advance past
// it), and skip duplicate values at the same recursion depth to avoid
// duplicate combinations.
function combination_sum2(candidates, target) {
  const sorted = [...candidates].sort((a, b) => a - b);
  const result = [];
  const path = [];

  function backtrack(start, remaining) {
    if (remaining === 0) {
      result.push([...path]);
      return;
    }
    for (let i = start; i < sorted.length; i++) {
      const c = sorted[i];
      if (c > remaining) break;
      if (i > start && c === sorted[i - 1]) continue;
      path.push(c);
      backtrack(i + 1, remaining - c);
      path.pop();
    }
  }

  backtrack(0, target);
  return result;
}
