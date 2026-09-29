function trace_request(groups, reject_at) {
  const layers = [];
  for (const group of groups) {
    layers.push(...group.slice().reverse());
  }

  const events = [];
  const entered = [];
  let rejected = false;

  for (const name of layers) {
    events.push(`in:${name}`);
    entered.push(name);
    if (name === reject_at) {
      rejected = true;
      break;
    }
  }

  if (!rejected) events.push("handler");

  for (let i = entered.length - 1; i >= 0; i--) {
    events.push(`out:${entered[i]}`);
  }

  return events;
}
