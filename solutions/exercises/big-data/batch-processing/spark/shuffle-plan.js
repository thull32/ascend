function shuffle_plan(map_outputs, num_reducers, threshold) {
  const partition = (key) => {
    let s = 0;
    for (const ch of key) s += ch.charCodeAt(0);
    return s % num_reducers;
  };

  const blocks = [];
  for (const outputs of map_outputs) {
    const row = new Array(num_reducers).fill(0);
    for (const [key, nbytes] of outputs) {
      row[partition(key)] += nbytes;
    }
    blocks.push(row);
  }

  const reduceInput = new Array(num_reducers).fill(0);
  for (let p = 0; p < num_reducers; p++) {
    for (const row of blocks) reduceInput[p] += row[p];
  }

  const sortedRi = [...reduceInput].sort((a, b) => a - b);
  const n = sortedRi.length;
  let median = 0;
  if (n > 0) {
    if (n % 2 === 1) {
      median = sortedRi[Math.floor(n / 2)];
    } else {
      median = (sortedRi[n / 2 - 1] + sortedRi[n / 2]) / 2;
    }
  }

  const skewed = [];
  for (let p = 0; p < num_reducers; p++) {
    if (reduceInput[p] > 5 * median && reduceInput[p] > threshold) skewed.push(p);
  }

  return { blocks, reduce_input: reduceInput, skewed };
}
