// Largest Rectangle in a Histogram — monotonic stack, sentinel bar of height 0.
function largest_rectangle(heights) {
  let best = 0;
  const stack = []; // indices, heights strictly increasing bottom to top
  const extended = heights.concat([0]);
  for (let i = 0; i < extended.length; i++) {
    const h = extended[i];
    while (stack.length && extended[stack[stack.length - 1]] > h) {
      const top = stack.pop();
      const height = extended[top];
      const left = stack.length ? stack[stack.length - 1] : -1;
      const width = i - left - 1;
      best = Math.max(best, height * width);
    }
    stack.push(i);
  }
  return best;
}
