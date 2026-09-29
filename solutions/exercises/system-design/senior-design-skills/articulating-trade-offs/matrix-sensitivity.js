function matrix_sensitivity(weights, scores) {
  const totals = scores.map(opt => opt.reduce((sum, s, i) => sum + weights[i] * s, 0));
  const best = Math.max(...totals);
  const winner = totals.indexOf(best);

  const flip_up = [];
  const flip_down = [];

  for (let c = 0; c < weights.length; c++) {
    let bestUp = null;
    let bestDown = null;

    for (let j = 0; j < scores.length; j++) {
      if (j === winner) continue;
      const gap = totals[winner] - totals[j];

      const diffUp = scores[j][c] - scores[winner][c];
      if (diffUp > 0) {
        const d = Math.floor(gap / diffUp) + 1;
        if (bestUp === null || d < bestUp) bestUp = d;
      }

      const diffDown = scores[winner][c] - scores[j][c];
      if (diffDown > 0) {
        const d = Math.floor(gap / diffDown) + 1;
        if (d <= weights[c] && (bestDown === null || d < bestDown)) bestDown = d;
      }
    }

    flip_up.push(bestUp);
    flip_down.push(bestDown);
  }

  return { totals, winner, flip_up, flip_down };
}
