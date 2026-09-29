function roundTo(x, digits) {
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}

function commit_plan(tasks, z, focus) {
  if (tasks.length === 0) {
    return { mean: 0, sigma: 0, riskiest: -1, working_days: 0, commit_day: 0 };
  }

  let totalMean = 0;
  let totalVar = 0;
  let riskiest = 0;
  let bestVar = -1;

  tasks.forEach(([o, m, p], i) => {
    const mean = (o + 4 * m + p) / 6;
    const sd = (p - o) / 6;
    const variance = sd * sd;
    totalMean += mean;
    totalVar += variance;
    if (variance > bestVar) {
      bestVar = variance;
      riskiest = i;
    }
  });

  const sigma = Math.sqrt(totalVar);
  const commitment = totalMean + z * sigma;
  const workingDays = Math.ceil(commitment / focus);

  let commitDay;
  if (workingDays === 0) {
    commitDay = 0;
  } else {
    const w = workingDays;
    commitDay = w + 2 * Math.floor((w - 1) / 5);
  }

  return {
    mean: roundTo(totalMean, 2),
    sigma: roundTo(sigma, 2),
    riskiest,
    working_days: workingDays,
    commit_day: commitDay,
  };
}
