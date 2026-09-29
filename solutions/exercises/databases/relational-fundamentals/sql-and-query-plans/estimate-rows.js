function estimate_rows(stats, op, value) {
  const rows = stats.rows;
  const nullFrac = stats.null_frac;
  const nDistinct = stats.n_distinct;
  const mcv = stats.mcv;
  const histogram = stats.histogram;

  const mcvSum = mcv.reduce((s, [, freq]) => s + freq, 0);
  const rest = 1 - nullFrac - mcvSum;

  let selectivity;
  if (op === "=") {
    const hit = mcv.find(([v]) => v === value);
    if (hit) {
      selectivity = hit[1];
    } else {
      const denom = nDistinct - mcv.length;
      selectivity = denom > 0 ? rest / denom : 0;
    }
  } else {
    selectivity = mcv.filter(([v]) => v < value).reduce((s, [, freq]) => s + freq, 0);
    let f;
    if (histogram.length) {
      const k = histogram.length - 1;
      const b0 = histogram[0];
      const bk = histogram[histogram.length - 1];
      if (value <= b0) {
        f = 0;
      } else if (value >= bk) {
        f = 1;
      } else {
        let i = 0;
        for (let j = 0; j < histogram.length - 1; j++) {
          if (histogram[j] <= value) i = j;
        }
        f = (i + (value - histogram[i]) / (histogram[i + 1] - histogram[i])) / k;
      }
    } else {
      f = 0;
    }
    selectivity += rest * f;
  }

  return Math.round(selectivity * rows);
}
