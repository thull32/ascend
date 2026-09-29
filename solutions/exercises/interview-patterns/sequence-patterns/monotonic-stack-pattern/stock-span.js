function stock_span(prices) {
  const stack = [];
  const spans = [];
  for (let i = 0; i < prices.length; i++) {
    const price = prices[i];
    while (stack.length && prices[stack[stack.length - 1]] <= price) {
      stack.pop();
    }
    const span = stack.length ? i - stack[stack.length - 1] : i + 1;
    spans.push(span);
    stack.push(i);
  }
  return spans;
}
