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

function rendezvous_owner(nodes, keys) {
  const owners = [];
  for (const key of keys) {
    let bestScore = -1;
    let bestNode = null;
    for (const node of nodes) {
      const score = hash32(`${node}:${key}`);
      if (score > bestScore || (score === bestScore && node < bestNode)) {
        bestScore = score;
        bestNode = node;
      }
    }
    owners.push(bestNode);
  }
  return owners;
}
