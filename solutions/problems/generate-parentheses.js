// Backtrack, only opening a new '(' while under n and only closing while
// there's an unmatched '(' to close.
function generate_parentheses(n) {
  const out = [];

  function build(prefix, opened, closed) {
    if (prefix.length === 2 * n) {
      out.push(prefix);
      return;
    }
    if (opened < n) build(prefix + "(", opened + 1, closed);
    if (closed < opened) build(prefix + ")", opened, closed + 1);
  }

  build("", 0, 0);
  return out;
}
