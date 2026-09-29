function buildAutomaton(patterns) {
  const children = [new Map()];
  const fail = [0];
  const output = [[]];

  patterns.forEach((p, idx) => {
    let cur = 0;
    for (const ch of p) {
      let nxt = children[cur].get(ch);
      if (nxt === undefined) {
        children.push(new Map());
        fail.push(0);
        output.push([]);
        nxt = children.length - 1;
        children[cur].set(ch, nxt);
      }
      cur = nxt;
    }
    output[cur].push(idx);
  });

  const queue = [];
  for (const [, v] of children[0]) {
    fail[v] = 0;
    queue.push(v);
  }

  let qi = 0;
  while (qi < queue.length) {
    const u = queue[qi++];
    for (const [ch, v] of children[u]) {
      queue.push(v);
      let f = fail[u];
      while (f !== 0 && !children[f].has(ch)) f = fail[f];
      if (children[f].has(ch) && children[f].get(ch) !== v) {
        fail[v] = children[f].get(ch);
      } else {
        fail[v] = 0;
      }
      output[v] = output[v].concat(output[fail[v]]);
    }
  }

  return { children, fail, output };
}

function censor(banned, text) {
  if (banned.length === 0 || text.length === 0) return text;

  const { children, fail, output } = buildAutomaton(banned);

  const diff = new Array(text.length + 1).fill(0);
  let node = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (node !== 0 && !children[node].has(ch)) node = fail[node];
    node = children[node].has(ch) ? children[node].get(ch) : 0;
    for (const idx of output[node]) {
      const length = banned[idx].length;
      const start = i - length + 1;
      diff[start] += 1;
      diff[i + 1] -= 1;
    }
  }

  let running = 0;
  const result = [];
  for (let i = 0; i < text.length; i++) {
    running += diff[i];
    result.push(running > 0 ? "*" : text[i]);
  }
  return result.join("");
}
