function node_order(ops) {
  const out = [];
  const ticks = [], micro = [], immediates = [], timeouts = [];

  function schedule(op) {
    const kind = op[0], label = op[1];
    const children = op.length > 2 ? op[2] : [];
    if (kind === "sync") {
      out.push(label);
    } else if (kind === "nextTick") {
      ticks.push([label, children]);
    } else if (kind === "microtask") {
      micro.push([label, children]);
    } else if (kind === "immediate") {
      immediates.push([label, children]);
    } else if (kind === "timeout") {
      timeouts.push([label, children]);
    }
  }

  function run(label, children) {
    out.push(label);
    for (const child of children) schedule(child);
  }

  function drain() {
    while (ticks.length > 0 || micro.length > 0) {
      while (ticks.length > 0) {
        const [label, children] = ticks.shift();
        run(label, children);
      }
      while (micro.length > 0) {
        const [label, children] = micro.shift();
        run(label, children);
      }
    }
  }

  for (const op of ops) schedule(op);
  drain();

  for (const [label, children] of immediates) {
    run(label, children);
    drain();
  }

  for (const [label, children] of timeouts) {
    run(label, children);
    drain();
  }

  return out;
}
