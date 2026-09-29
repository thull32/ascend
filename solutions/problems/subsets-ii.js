// Same subset backtracking, but sorted first and skipping a duplicate value
// at the same recursion depth so each distinct subset appears once.
function subsets_with_dup(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const result = [];
  const path = [];

  function backtrack(start) {
    result.push([...path]);
    for (let i = start; i < sorted.length; i++) {
      if (i > start && sorted[i] === sorted[i - 1]) continue;
      path.push(sorted[i]);
      backtrack(i + 1);
      path.pop();
    }
  }

  backtrack(0);
  return result;
}
