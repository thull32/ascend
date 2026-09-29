function final_counter(increments, schedule) {
  const n = increments.length;
  const step = new Array(n).fill(0); // 0=load, 1=add, 2=store
  const register = new Array(n).fill(0);
  const completed = new Array(n).fill(0);
  let counter = 0;

  const finished = (t) => completed[t] >= increments[t];

  const runStep = (t) => {
    if (step[t] === 0) {
      register[t] = counter;
      step[t] = 1;
    } else if (step[t] === 1) {
      register[t] += 1;
      step[t] = 2;
    } else {
      counter = register[t];
      completed[t] += 1;
      step[t] = 0;
    }
  };

  for (const t of schedule) {
    if (!finished(t)) runStep(t);
  }
  for (let t = 0; t < n; t++) {
    while (!finished(t)) runStep(t);
  }
  return counter;
}
