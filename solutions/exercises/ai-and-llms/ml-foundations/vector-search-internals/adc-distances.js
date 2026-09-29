function adc_distances(query, codebooks, codes) {
  const m = codebooks.length;
  const s = Math.floor(query.length / m);
  const table = [];
  for (let j = 0; j < m; j++) {
    const subQ = query.slice(j * s, (j + 1) * s);
    const dists = [];
    for (const centroid of codebooks[j]) {
      let d = 0;
      for (let c = 0; c < subQ.length; c++) {
        d += (subQ[c] - centroid[c]) ** 2;
      }
      dists.push(d);
    }
    table.push(dists);
  }

  const result = [];
  for (const code of codes) {
    let total = 0;
    for (let j = 0; j < m; j++) {
      total += table[j][code[j]];
    }
    result.push(total);
  }
  return result;
}
