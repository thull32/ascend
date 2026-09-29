function chan_trace(capacity, ops) {
  const buf = [], recvq = [], sendq = []; // sendq entries: [g, value]
  let closed = false;
  const received = [];
  let panic = false;

  for (const op of ops) {
    const kind = op[0];
    if (kind === "send") {
      const g = op[1], value = op[2];
      if (closed) {
        panic = true;
        break;
      }
      if (recvq.length > 0) {
        const r = recvq.shift();
        received.push([r, value, true]);
      } else if (buf.length < capacity) {
        buf.push(value);
      } else {
        sendq.push([g, value]);
      }
    } else if (kind === "recv") {
      const g = op[1];
      if (buf.length > 0) {
        const value = buf.shift();
        received.push([g, value, true]);
        if (sendq.length > 0) {
          const [, sv] = sendq.shift();
          buf.push(sv);
        }
      } else if (sendq.length > 0) {
        const [, sv] = sendq.shift();
        received.push([g, sv, true]);
      } else if (closed) {
        received.push([g, null, false]);
      } else {
        recvq.push(g);
      }
    } else {
      // close
      if (closed) {
        panic = true;
        break;
      }
      closed = true;
      while (recvq.length > 0) {
        const r = recvq.shift();
        received.push([r, null, false]);
      }
      if (sendq.length > 0) {
        panic = true;
        break;
      }
    }
  }

  const blocked = sendq.map(([g]) => g).concat(recvq);
  return { received, blocked, panic };
}
