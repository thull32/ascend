// Kahn's algorithm; the pop order is a valid topological order.
function find_order(num_courses, prerequisites) {
  const unlocks = Array.from({ length: num_courses }, () => []);
  const indegree = new Array(num_courses).fill(0);
  for (const [course, pre] of prerequisites) {
    unlocks[pre].push(course);
    indegree[course] += 1;
  }

  const ready = [];
  for (let c = 0; c < num_courses; c++) {
    if (indegree[c] === 0) ready.push(c);
  }

  const order = [];
  let head = 0;
  while (head < ready.length) {
    const c = ready[head++];
    order.push(c);
    for (const nxt of unlocks[c]) {
      indegree[nxt] -= 1;
      if (indegree[nxt] === 0) ready.push(nxt);
    }
  }
  return order.length === num_courses ? order : [];
}
