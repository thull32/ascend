function point_in_time_join(labels, features, ttl) {
  const byEntity = new Map();
  for (const [entity, ts, value] of features) {
    if (!byEntity.has(entity)) byEntity.set(entity, []);
    byEntity.get(entity).push([ts, value]);
  }
  for (const obs of byEntity.values()) obs.sort((a, b) => a[0] - b[0]);

  const result = [];
  for (const [entity, labelTs] of labels) {
    let best = null;
    for (const [ts, value] of byEntity.get(entity) || []) {
      if (ts <= labelTs) {
        if (best === null || ts > best[0]) best = [ts, value];
      } else {
        break;
      }
    }
    if (best !== null && labelTs - best[0] <= ttl) {
      result.push(best[1]);
    } else {
      result.push(null);
    }
  }
  return result;
}
