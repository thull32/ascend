function resolve(value, replicas, roundUp) {
  if (typeof value === "string") {
    const pct = parseInt(value.slice(0, -1), 10);
    const raw = (replicas * pct) / 100;
    return roundUp ? Math.ceil(raw) : Math.floor(raw);
  }
  return value;
}

function rolling_update(replicas, max_surge, max_unavailable) {
  let surge = resolve(max_surge, replicas, true);
  let unavailable = resolve(max_unavailable, replicas, false);
  if (surge === 0 && unavailable === 0) unavailable = 1;

  let old = replicas;
  let neu = 0;
  const result = [[old, neu]];
  let readyNew = 0;

  while (!(old === 0 && neu === replicas)) {
    if (old + neu < replicas + surge) {
      const create = Math.min(replicas + surge - (old + neu), replicas - neu);
      if (create > 0) {
        neu += create;
        result.push([old, neu]);
      }
    }
    const ready = old + readyNew;
    const limit = replicas - unavailable;
    if (ready > limit) {
      const del = Math.min(old, ready - limit);
      if (del > 0) {
        old -= del;
        result.push([old, neu]);
      }
    }
    readyNew = neu;
  }

  return result;
}
