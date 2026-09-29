const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const HEX_RE = /0x[0-9a-f]+/g;
const NUM_RE = /\d+(?:\.\d+)?/g;

function signature(message) {
  message = message.replace(UUID_RE, "<uuid>");
  message = message.replace(HEX_RE, "<hex>");
  message = message.replace(NUM_RE, "<n>");
  return message;
}

function top_signatures(entries, top) {
  const counts = new Map();
  const firstSeen = new Map();
  const lastSeen = new Map();

  for (const [ts, level, message] of entries) {
    if (level !== "ERROR" && level !== "WARN") continue;
    const sig = signature(message);
    counts.set(sig, (counts.get(sig) || 0) + 1);
    if (!firstSeen.has(sig)) firstSeen.set(sig, ts);
    lastSeen.set(sig, ts);
  }

  const rows = [...counts.keys()].map(s => [counts.get(s), firstSeen.get(s), lastSeen.get(s), s]);
  rows.sort((a, b) => {
    if (a[0] !== b[0]) return b[0] - a[0];
    if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
    if (a[3] !== b[3]) return a[3] < b[3] ? -1 : 1;
    return 0;
  });

  return rows.slice(0, top);
}
