function hlc_stamps(events) {
  const state = new Map();
  const msgs = new Map();
  const out = [];

  for (const ev of events) {
    const kind = ev[0];
    const node = ev[1];
    const pt = ev[2];
    const [l, c] = state.get(node) || [0, 0];

    if (kind === "local" || kind === "send") {
      const l2 = Math.max(l, pt);
      const c2 = l2 === l ? c + 1 : 0;
      state.set(node, [l2, c2]);
      out.push([l2, c2]);
      if (kind === "send") {
        msgs.set(ev[3], [l2, c2]);
      }
    } else {
      const [lm, cm] = msgs.get(ev[3]);
      const l2 = Math.max(l, lm, pt);
      let c2;
      if (l2 === l && l2 === lm) c2 = Math.max(c, cm) + 1;
      else if (l2 === l) c2 = c + 1;
      else if (l2 === lm) c2 = cm + 1;
      else c2 = 0;
      state.set(node, [l2, c2]);
      out.push([l2, c2]);
    }
  }

  return out;
}
