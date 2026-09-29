// Monotonic decreasing stack of indices with unresolved answers.
function daily_temperatures(temps) {
  const n = temps.length;
  const answer = new Array(n).fill(0);
  const stack = [];
  for (let i = 0; i < n; i++) {
    const t = temps[i];
    while (stack.length > 0 && temps[stack[stack.length - 1]] < t) {
      const j = stack.pop();
      answer[j] = i - j;
    }
    stack.push(i);
  }
  return answer;
}
