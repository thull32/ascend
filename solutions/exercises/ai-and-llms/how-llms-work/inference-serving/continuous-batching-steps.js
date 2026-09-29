function batching_steps(lengths, slots) {
  const n = lengths.length;

  let staticSteps = 0;
  for (let i = 0; i < n; i += slots) {
    staticSteps += Math.max(...lengths.slice(i, i + slots));
  }

  let active = [];
  let idx = 0;
  let continuousSteps = 0;
  while (true) {
    while (active.length < slots && idx < n) {
      active.push(lengths[idx]);
      idx += 1;
    }
    if (active.length === 0) break;
    continuousSteps += 1;
    active = active.map((x) => x - 1).filter((x) => x > 0);
  }
  return [staticSteps, continuousSteps];
}
