function retrieval_metrics(results, relevant, k) {
  let recallSum = 0;
  let rrSum = 0;
  let evaluated = 0;

  for (const qid of Object.keys(relevant)) {
    const relIds = relevant[qid];
    if (!relIds || relIds.length === 0) continue;
    const ranking = (results[qid] || []).slice(0, k);
    const relSet = new Set(relIds);
    let hits = 0;
    for (const d of ranking) {
      if (relSet.has(d)) hits += 1;
    }
    const recall = hits / relIds.length;

    let rr = 0;
    for (let idx = 0; idx < ranking.length; idx++) {
      if (relSet.has(ranking[idx])) {
        rr = 1 / (idx + 1);
        break;
      }
    }

    recallSum += recall;
    rrSum += rr;
    evaluated += 1;
  }

  if (evaluated === 0) {
    return { recall_at_k: 0, mrr: 0, evaluated: 0 };
  }
  return {
    recall_at_k: Math.round((recallSum / evaluated) * 1000) / 1000,
    mrr: Math.round((rrSum / evaluated) * 1000) / 1000,
    evaluated,
  };
}
