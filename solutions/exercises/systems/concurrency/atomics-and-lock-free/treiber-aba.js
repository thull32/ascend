function treiber(initial, ops, tagged) {
  const nxt = new Map();
  for (let i = 0; i < initial.length - 1; i++) {
    nxt.set(initial[i], initial[i + 1]);
  }
  if (initial.length > 0) nxt.set(initial[initial.length - 1], null);

  let head = initial.length > 0 ? initial[0] : null;
  let version = 0;
  const recordedHead = new Map();
  const recordedNext = new Map();
  const recordedVersion = new Map();
  const casResults = [];

  for (const op of ops) {
    const kind = op[1];
    if (kind === "pop") {
      head = nxt.get(head);
      version += 1;
    } else if (kind === "push") {
      const n = op[2];
      nxt.set(n, head);
      head = n;
      version += 1;
    } else if (kind === "read") {
      const t = op[0];
      recordedHead.set(t, head);
      recordedNext.set(t, nxt.has(head) ? nxt.get(head) : null);
      recordedVersion.set(t, version);
    } else {
      const t = op[0];
      let ok = head === recordedHead.get(t);
      if (tagged) ok = ok && version === recordedVersion.get(t);
      if (ok) {
        head = recordedNext.get(t);
        version += 1;
      }
      casResults.push(ok);
    }
  }

  const stack = [];
  let node = head;
  while (node !== null && node !== undefined && stack.length < 10) {
    stack.push(node);
    node = nxt.has(node) ? nxt.get(node) : null;
  }

  return { stack, cas: casResults };
}
