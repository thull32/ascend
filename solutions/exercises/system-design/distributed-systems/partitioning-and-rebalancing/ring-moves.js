function owner(ring, pos) {
  let idx = ring.length;
  for (let i = 0; i < ring.length; i++) {
    if (ring[i][0] >= pos) {
      idx = i;
      break;
    }
  }
  if (idx === ring.length) idx = 0;
  return ring[idx][1];
}

function ring_moves(nodes, new_node, keys) {
  const oldRing = [];
  for (const name of Object.keys(nodes)) {
    for (const p of nodes[name]) oldRing.push([p, name]);
  }
  oldRing.sort((a, b) => a[0] - b[0]);

  const [newName, newPositionsList] = new_node;
  const newRing = oldRing.concat(newPositionsList.map(p => [p, newName]));
  newRing.sort((a, b) => a[0] - b[0]);

  const moves = [];
  for (const k of Object.keys(keys)) {
    const pos = keys[k];
    const oldOwner = owner(oldRing, pos);
    const newOwner = owner(newRing, pos);
    if (oldOwner !== newOwner) {
      moves.push([k, oldOwner, newOwner]);
    }
  }

  moves.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return moves;
}
