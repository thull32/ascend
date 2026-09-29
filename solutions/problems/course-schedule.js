// Kahn's algorithm: a valid order exists iff the prerequisite graph is a DAG.
function can_finish(num_courses, prerequisites) {
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

  let taken = 0;
  let head = 0;
  while (head < ready.length) {
    const c = ready[head++];
    taken += 1;
    for (const nxt of unlocks[c]) {
      indegree[nxt] -= 1;
      if (indegree[nxt] === 0) ready.push(nxt);
    }
  }
  return taken === num_courses;
}
