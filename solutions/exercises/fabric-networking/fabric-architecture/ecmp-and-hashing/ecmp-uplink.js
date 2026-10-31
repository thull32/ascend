// Pick each flow's ECMP uplink from a seeded FNV-1a hash of its 5-tuple.

function ecmp_uplinks(flows, members, seed) {
  const picks = [];
  for (const [src, dst, proto, sport, dport] of flows) {
    const key = `${src}|${dst}|${proto}|${sport}|${dport}`;
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    picks.push(members[h % members.length]);
  }
  return picks;
}
