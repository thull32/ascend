import re

UUID_RE = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
HEX_RE = re.compile(r'0x[0-9a-f]+')
NUM_RE = re.compile(r'\d+(?:\.\d+)?')


def _signature(message):
    message = UUID_RE.sub('<uuid>', message)
    message = HEX_RE.sub('<hex>', message)
    message = NUM_RE.sub('<n>', message)
    return message


def top_signatures(entries, top):
    counts = {}
    first_seen = {}
    last_seen = {}

    for ts, level, message in entries:
        if level not in ("ERROR", "WARN"):
            continue
        sig = _signature(message)
        counts[sig] = counts.get(sig, 0) + 1
        if sig not in first_seen:
            first_seen[sig] = ts
        last_seen[sig] = ts

    rows = [[counts[s], first_seen[s], last_seen[s], s] for s in counts]
    rows.sort(key=lambda r: (-r[0], r[1], r[3]))
    return rows[:top]
