function find_flaky(runs) {
  const outcomes = new Map();
  for (const [name, commit, passed] of runs) {
    const key = name + "\u0000" + commit;
    if (!outcomes.has(key)) outcomes.set(key, { name, set: new Set() });
    outcomes.get(key).set.add(passed);
  }
  const flaky = new Set();
  for (const { name, set } of outcomes.values()) {
    if (set.size > 1) flaky.add(name);
  }
  return Array.from(flaky).sort();
}
