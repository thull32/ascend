const DAY_MS = 24 * 60 * 60 * 1000;

function parseUTC(s) {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatUTC(ms) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function streak(days, today) {
  const daySet = new Set(days);
  let cursor = parseUTC(today);
  if (!daySet.has(today)) {
    cursor -= DAY_MS;
  }

  let count = 0;
  while (daySet.has(formatUTC(cursor))) {
    count += 1;
    cursor -= DAY_MS;
  }

  return count;
}
