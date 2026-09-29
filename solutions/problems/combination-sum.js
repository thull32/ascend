// Backtrack over sorted candidates, reusing each candidate from its own
// index onward so combinations (not permutations) are generated once each.
function combination_sum(candidates, target) {
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
      path.push(c);
      backtrack(i, remaining - c);
      path.pop();
    }
  }

  backtrack(0, target);
  return result;
}
