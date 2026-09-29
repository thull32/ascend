function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function merkle_root(leaves) {
  if (leaves.length === 0) return 0;

  let level = leaves.map((s) => fnv1a(s));
  while (level.length > 1) {
    if (level.length % 2 === 1) level.push(level[level.length - 1]);
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1];
      next.push(fnv1a(String(left) + ":" + String(right)));
    }
    level = next;
  }

  return level[0];
}
