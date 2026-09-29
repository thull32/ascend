function utf8Bytes(s) {
  const bytes = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i);
    if (cp > 0xffff) i++; // consumed a surrogate pair
    if (cp < 0x80) {
      bytes.push(cp);
    } else if (cp < 0x800) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f)
      );
    }
  }
  return bytes;
}

function h32(s) {
  let h = 2166136261;                   // FNV-1a over the UTF-8 bytes
  for (const b of utf8Bytes(s)) h = Math.imul(h ^ b, 16777619) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;   // murmur3 finaliser
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function buildRing(nodes, vnodes) {
  const points = [];
  for (const n of nodes) {
    for (let i = 0; i < vnodes; i++) {
      points.push([h32(`${n}#${i}`), n]);
    }
  }
  points.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return points;
}

function owner(points, key) {
  const target = h32(key);
  let lo = 0, hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === points.length) lo = 0;
  return points[lo][1];
}

function ring_moves(old_nodes, new_nodes, vnodes, keys) {
  const oldPoints = buildRing(old_nodes, vnodes);
  const newPoints = buildRing(new_nodes, vnodes);

  const moves = [];
  for (const key of keys) {
    const oldOwner = owner(oldPoints, key);
    const newOwner = owner(newPoints, key);
    if (oldOwner !== newOwner) {
      moves.push([key, oldOwner, newOwner]);
    }
  }

  return moves;
}
