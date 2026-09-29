// The most frequent task (count f) needs (f-1) full cooldown cycles of
// length n+1 plus one slot per task tied for that max frequency; that lower
// bound can never be beaten, and idle slots pad it out otherwise.
function least_interval(tasks, n) {
  const counts = new Map();
  for (const t of tasks) counts.set(t, (counts.get(t) || 0) + 1);
  const f = Math.max(...counts.values());
  let m = 0;
  for (const c of counts.values()) if (c === f) m += 1;
  return Math.max(tasks.length, (f - 1) * (n + 1) + m);
}
