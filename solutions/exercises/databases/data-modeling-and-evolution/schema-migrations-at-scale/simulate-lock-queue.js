const CONFLICTS = {
  "ACCESS SHARE": new Set(["ACCESS EXCLUSIVE"]),
  "ROW EXCLUSIVE": new Set(["SHARE", "ACCESS EXCLUSIVE"]),
  "SHARE UPDATE EXCLUSIVE": new Set(["SHARE UPDATE EXCLUSIVE", "SHARE", "ACCESS EXCLUSIVE"]),
  SHARE: new Set(["ROW EXCLUSIVE", "SHARE UPDATE EXCLUSIVE", "ACCESS EXCLUSIVE"]),
  "ACCESS EXCLUSIVE": new Set([
    "ACCESS SHARE",
    "ROW EXCLUSIVE",
    "SHARE UPDATE EXCLUSIVE",
    "SHARE",
    "ACCESS EXCLUSIVE",
  ]),
};

function conflicts(a, b) {
  return CONFLICTS[a].has(b) || CONFLICTS[b].has(a);
}

function anyConflict(mode, others) {
  return others.some((m) => conflicts(mode, m));
}

function simulate_lock_queue(events) {
  const grantedLog = [];
  const held = new Map(); // session -> mode
  let waiting = []; // list of [session, mode]

  for (const ev of events) {
    if (ev[0] === "acquire") {
      const [, session, mode] = ev;
      const heldModes = [...held.values()];
      const waitingModes = waiting.map((w) => w[1]);
      if (!anyConflict(mode, heldModes) && !anyConflict(mode, waitingModes)) {
        held.set(session, mode);
        grantedLog.push(session);
      } else {
        waiting.push([session, mode]);
      }
    } else {
      const [, session] = ev;
      if (held.has(session)) {
        held.delete(session);
      } else {
        waiting = waiting.filter((w) => w[0] !== session);
      }

      const newWaiting = [];
      const blockedModes = [];
      for (const [sess, mode] of waiting) {
        const heldModes = [...held.values()];
        if (!anyConflict(mode, heldModes) && !anyConflict(mode, blockedModes)) {
          held.set(sess, mode);
          grantedLog.push(sess);
        } else {
          blockedModes.push(mode);
          newWaiting.push([sess, mode]);
        }
      }
      waiting = newWaiting;
    }
  }

  return { granted: grantedLog, waiting: waiting.map((w) => w[0]) };
}
