function eval_rpn(tokens) {
  const stack = [];
  for (const t of tokens) {
    if (t === "+" || t === "-" || t === "*" || t === "/") {
      const b = stack.pop(); // right operand is on top
      const a = stack.pop();
      if (t === "+") stack.push(a + b);
      else if (t === "-") stack.push(a - b);
      else if (t === "*") stack.push(a * b);
      else stack.push(Math.trunc(a / b)); // truncate toward zero, not floor
    } else {
      stack.push(parseInt(t, 10));
    }
  }
  return stack[0];
}
