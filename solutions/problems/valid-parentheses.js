// A stack of open brackets; every closer must match the most recent opener.
function is_valid(s) {
  const pairs = { ")": "(", "]": "[", "}": "{" };
  const stack = [];
  for (const ch of s) {
    if (ch in pairs) {
      if (!stack.length || stack[stack.length - 1] !== pairs[ch]) return false;
      stack.pop();
    } else {
      stack.push(ch);
    }
  }
  return stack.length === 0;
}
