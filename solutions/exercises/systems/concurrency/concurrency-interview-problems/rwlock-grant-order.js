function rw_grant_order(ops) {
  let readers = 0;
  let writer = null;
  const waitingReaders = [];
  const waitingWriters = [];
  const granted = [];
  const mode = new Map();

  for (const [kind, tid] of ops) {
    if (kind === "read") {
      if (writer === null && waitingWriters.length === 0) {
        readers += 1;
        granted.push(tid);
        mode.set(tid, "r");
      } else {
        waitingReaders.push(tid);
      }
    } else if (kind === "write") {
      if (writer === null && readers === 0) {
        writer = tid;
        granted.push(tid);
        mode.set(tid, "w");
      } else {
        waitingWriters.push(tid);
      }
    } else {
      const released = mode.get(tid);
      mode.delete(tid);
      if (released === "w") {
        writer = null;
        if (waitingReaders.length > 0) {
          while (waitingReaders.length > 0) {
            const r = waitingReaders.shift();
            readers += 1;
            granted.push(r);
            mode.set(r, "r");
          }
        } else if (waitingWriters.length > 0) {
          const w = waitingWriters.shift();
          writer = w;
          granted.push(w);
          mode.set(w, "w");
        }
      } else {
        readers -= 1;
        if (readers === 0 && waitingWriters.length > 0) {
          const w = waitingWriters.shift();
          writer = w;
          granted.push(w);
          mode.set(w, "w");
        }
      }
    }
  }

  return granted;
}
