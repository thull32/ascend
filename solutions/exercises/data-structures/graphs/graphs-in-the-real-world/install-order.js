function install_order(packages) {
  const names = Object.keys(packages);
  const adj = {};
  const indegree = {};
  for (const name of names) {
    adj[name] = [];
    indegree[name] = 0;
  }
  for (const p of names) {
    for (const d of packages[p]) {
      adj[d].push(p);
      indegree[p]++;
    }
  }

  const ready = names.filter((name) => indegree[name] === 0);
  const order = [];
  while (ready.length > 0) {
    ready.sort();
    const u = ready.shift();
    order.push(u);
    for (const v of adj[u]) {
      indegree[v]--;
      if (indegree[v] === 0) ready.push(v);
    }
  }

  return order.length === names.length ? order : [];
}
