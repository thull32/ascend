function hash32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h >>>= 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

function ring_owner(nodes, vnodes, keys) {
  const points = [];
  for (const node of nodes) {
    for (let i = 0; i < vnodes; i++) {
      points.push([hash32(`${node}#${i}`), node]);
    }
  }
  points.sort((a, b) => (a[0] - b[0]) || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const positions = points.map((p) => p[0]);

  function lowerBound(pos) {
    let lo = 0, hi = positions.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[mid] < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const owners = [];
  for (const key of keys) {
    const pos = hash32(key);
    let idx = lowerBound(pos);
    if (idx === points.length) idx = 0;
    owners.push(points[idx][1]);
  }
  return owners;
}
