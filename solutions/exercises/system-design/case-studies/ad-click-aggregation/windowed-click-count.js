function window_counts(events, window, delay) {
  const fired = [];
  const late = [];
  const seen = new Set();
  const counts = new Map(); // key "ad|ws" -> { ad, ws, count }
  let watermark = -Infinity;

  function fire(force) {
    const ready = [];
    for (const key of counts.keys()) {
      const { ad, ws } = counts.get(key);
      if (force || ws + window <= watermark) {
        ready.push([ws, ad, key]);
      }
    }
    ready.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
    for (const [ws, ad, key] of ready) {
      const entry = counts.get(key);
      fired.push([ad, ws, entry.count]);
      counts.delete(key);
    }
  }

  for (const [impressionId, adId, eventTime] of events) {
    if (seen.has(impressionId)) continue;
    seen.add(impressionId);

    const windowStart = eventTime - (((eventTime % window) + window) % window);
    if (windowStart + window <= watermark) {
      late.push(impressionId);
    } else {
      const key = adId + "|" + windowStart;
      if (!counts.has(key)) counts.set(key, { ad: adId, ws: windowStart, count: 0 });
      counts.get(key).count += 1;
    }

    watermark = Math.max(watermark, eventTime - delay);
    fire(false);
  }

  fire(true);
  return [fired, late];
}
