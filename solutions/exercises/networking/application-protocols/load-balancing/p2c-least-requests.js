// Power-of-two-choices least-requests balancing simulation.

function p2c(n, events) {
  const active = new Array(n).fill(0);
  const chosen = [];
  for (const event of events) {
    if (event[0] === "req") {
      const a = event[1];
      const b = event[2];
      const target = active[a] <= active[b] ? a : b;
      active[target] += 1;
      chosen.push(target);
    } else {
      const k = event[1];
      active[k] -= 1;
    }
  }
  return chosen;
}
