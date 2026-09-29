// A stack evaluates reverse Polish notation directly: operators pop their
// two operands and push the result.
function eval_rpn(tokens) {
  const stack = [];
  for (const tok of tokens) {
    if (tok === "+" || tok === "-" || tok === "*" || tok === "/") {
      const b = stack.pop();
      const a = stack.pop();
      if (tok === "+") stack.push(a + b);
      else if (tok === "-") stack.push(a - b);
      else if (tok === "*") stack.push(a * b);
      else stack.push(Math.trunc(a / b)); // truncates toward zero
    } else {
      stack.push(parseInt(tok, 10));
    }
  }
  return stack[stack.length - 1];
}
