function handle_requests(events) {
  const out = [];
  const store = new Map();
  for (const ev of events) {
    const kind = ev[0];
    if (kind === "request") {
      const [, account, key, body_hash, now] = ev;
      const k = account + "|" + key;
      let entry = store.get(k);
      if (entry !== undefined && now - entry.created >= 86400) {
        entry = undefined;
      }
      if (entry === undefined) {
        store.set(k, { hash: body_hash, state: "in_progress", response: null, created: now });
        out.push("execute");
      } else if (entry.hash !== body_hash) {
        out.push("mismatch");
      } else if (entry.state === "in_progress") {
        out.push("conflict");
      } else {
        out.push("replay:" + entry.response);
      }
    } else if (kind === "complete") {
      const [, account, key, response] = ev;
      const entry = store.get(account + "|" + key);
      entry.state = "done";
      entry.response = response;
    } else if (kind === "abort") {
      const [, account, key] = ev;
      store.delete(account + "|" + key);
    }
  }
  return out;
}
