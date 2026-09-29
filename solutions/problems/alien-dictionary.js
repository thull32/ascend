// Build a "comes before" graph from adjacent word pairs, then topologically
// sort it with Kahn's algorithm.
function alien_order(words) {
  const succ = new Map();
  for (const w of words) for (const ch of w) if (!succ.has(ch)) succ.set(ch, new Set());
  const indegree = new Map();
  for (const ch of succ.keys()) indegree.set(ch, 0);

  for (let i = 0; i + 1 < words.length; i++) {
    const w1 = words[i], w2 = words[i + 1];
    const minLen = Math.min(w1.length, w2.length);
    let diffFound = false;
    for (let j = 0; j < minLen; j++) {
      const a = w1[j], b = w2[j];
      if (a !== b) {
        diffFound = true;
        if (!succ.get(a).has(b)) {
          succ.get(a).add(b);
          indegree.set(b, indegree.get(b) + 1);
        }
        break;
      }
    }
    if (!diffFound && w1.length > w2.length) return "";
  }

  const ready = [];
  for (const ch of succ.keys()) if (indegree.get(ch) === 0) ready.push(ch);
  const out = [];
  let head = 0;
  while (head < ready.length) {
    const ch = ready[head++];
    out.push(ch);
    for (const nxt of succ.get(ch)) {
      indegree.set(nxt, indegree.get(nxt) - 1);
      if (indegree.get(nxt) === 0) ready.push(nxt);
    }
  }
  return out.length === succ.size ? out.join("") : "";
}
