function replication_audit(blocks, racks, dead, rf) {
  const deadSet = new Set(dead);
  const missing = [];
  const underReplicated = [];
  const singleRack = [];

  for (const blockId of Object.keys(blocks).sort()) {
    const live = blocks[blockId].filter((n) => !deadSet.has(n));
    if (live.length === 0) {
      missing.push(blockId);
    } else if (live.length < rf) {
      underReplicated.push([blockId, live.length]);
    }
    if (live.length >= 2) {
      const rackSet = new Set(live.map((n) => racks[n]));
      if (rackSet.size === 1) singleRack.push(blockId);
    }
  }

  return { missing, under_replicated: underReplicated, single_rack: singleRack };
}
