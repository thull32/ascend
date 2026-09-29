// Remove K Digits: greedy monotonic stack, keeping the result non-decreasing.
function remove_k_digits(num, k) {
  const stack = [];
  for (const d of num) {
    while (k > 0 && stack.length > 0 && stack[stack.length - 1] > d) {
      stack.pop();
      k -= 1;
    }
    stack.push(d);
  }
  if (k > 0) {
    stack.splice(stack.length - k, k);
  }
  let result = stack.join("").replace(/^0+/, "");
  return result || "0";
}
