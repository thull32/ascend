function latest_per_user(events) {
  const best = new Map();
  for (const [userId, eventTime, payload] of events) {
    if (!best.has(userId) || eventTime >= best.get(userId)[0]) {
      best.set(userId, [eventTime, payload]);
    }
  }
  return [...best.keys()]
    .sort()
    .map((userId) => [userId, best.get(userId)[1]]);
}
