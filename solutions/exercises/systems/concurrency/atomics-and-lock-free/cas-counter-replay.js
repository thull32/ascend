function cas_counter(increments, schedule) {
  const n = increments.length;
  const nextStep = new Array(n).fill("read");
  const expected = new Array(n).fill(0);
  const completed = new Array(n).fill(0);
  let counter = 0;
  let failures = 0;

  const finished = (t) => completed[t] >= increments[t];

  const runStep = (t) => {
    if (nextStep[t] === "read") {
      expected[t] = counter;
      nextStep[t] = "cas";
    } else {
      if (counter === expected[t]) {
        counter += 1;
        completed[t] += 1;
        nextStep[t] = "read";
      } else {
        failures += 1;
        nextStep[t] = "read";
      }
    }
  };

  for (const t of schedule) {
    if (!finished(t)) runStep(t);
  }
  for (let t = 0; t < n; t++) {
    while (!finished(t)) runStep(t);
  }

  return [counter, failures];
}
