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

function searchText(automaton, text) {
  const { children, fail, output } = automaton;
  const matches = [];
  let node = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    while (node !== 0 && !children[node].has(ch)) node = fail[node];
    node = children[node].has(ch) ? children[node].get(ch) : 0;
    for (const idx of output[node]) matches.push([i, idx]);
  }
  return matches;
}

function find_all(patterns, text) {
  if (patterns.length === 0) return [];
  const automaton = buildAutomaton(patterns);
  const matches = searchText(automaton, text);
  const result = matches.map(([i, idx]) => [i - patterns[idx].length + 1, patterns[idx]]);
  result.sort((a, b) => (a[0] !== b[0] ? a[0] - b[0] : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return result;
}
