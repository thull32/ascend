// Stack of (outer partial string, pending repeat count); '[' saves the
// outer context and starts fresh, ']' pops it and repeats the inner string.
function decode_string(s) {
  const stack = [];
  let current = [];
  let count = 0;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      count = count * 10 + Number(ch);
    } else if (ch === "[") {
      stack.push([current.join(""), count]);
      current = [];
      count = 0;
    } else if (ch === "]") {
      const [outer, k] = stack.pop();
      current = [outer + current.join("").repeat(k)];
    } else {
      current.push(ch);
    }
  }
  return current.join("");
}
