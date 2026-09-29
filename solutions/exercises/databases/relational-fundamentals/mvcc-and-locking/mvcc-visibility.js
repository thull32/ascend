function visible_value(versions, snapshot, committed) {
  const committedSet = new Set(committed);
  const xmaxSnap = snapshot.xmax;
  const xip = new Set(snapshot.xip);

  function counts(xid) {
    return committedSet.has(xid) && xid < xmaxSnap && !xip.has(xid);
  }

  for (const v of versions) {
    if (counts(v.xmin) && (v.xmax === null || !counts(v.xmax))) {
      return v.value;
    }
  }
  return null;
}
