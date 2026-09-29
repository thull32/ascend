function buffer_trace(capacity, ops) {
  const buf = [];
  const waitingPutters = [];  // [thread, value]
  const waitingTakers = [];   // thread
  const taken = [];

  function serve() {
    let changed = true;
    while (changed) {
      changed = false;
      if (buf.length > 0 && waitingTakers.length > 0) {
        const t = waitingTakers.shift();
        const v = buf.shift();
        taken.push([t, v]);
        changed = true;
      } else if (buf.length < capacity && waitingPutters.length > 0) {
        const [t, v] = waitingPutters.shift();
        buf.push(v);
        changed = true;
      }
    }
  }

  for (const op of ops) {
    if (op[1] === "put") {
      waitingPutters.push([op[0], op[2]]);
    } else {
      waitingTakers.push(op[0]);
    }
    serve();
  }

  return taken;
}
