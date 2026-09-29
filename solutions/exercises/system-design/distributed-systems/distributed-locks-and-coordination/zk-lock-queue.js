function zk_lock_queue(events) {
  let seq = 0;
  const znodes = new Map();
  const out = [];

  for (const [kind, client] of events) {
    if (kind === "create") {
      znodes.set(client, seq);
      seq += 1;
    } else {
      znodes.delete(client);
    }

    const ordered = [...znodes.entries()].sort((a, b) => a[1] - b[1]);
    let holder = null, token = null;
    if (ordered.length > 0) {
      holder = ordered[0][0];
      token = ordered[0][1];
    }

    const watching = {};
    for (let i = 1; i < ordered.length; i++) {
      watching[ordered[i][0]] = ordered[i - 1][0];
    }

    out.push({ holder, token, watching });
  }

  return out;
}
