function largest_rectangle(heights) {
  const n = heights.length;
  const stack = []; // indices, heights increasing bottom to top
  let best = 0;
  for (let i = 0; i <= n; i++) {
    const cur = i < n ? heights[i] : 0; // sentinel flushes the stack
    while (stack.length > 0 && heights[stack[stack.length - 1]] > cur) {
      const j = stack.pop();
      const left = stack.length > 0 ? stack[stack.length - 1] : -1;
      best = Math.max(best, heights[j] * (i - left - 1));
    }
    stack.push(i);
  }
  return best;
}
