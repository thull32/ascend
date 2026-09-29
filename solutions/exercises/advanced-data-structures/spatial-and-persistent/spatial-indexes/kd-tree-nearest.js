function build(pts, depth) {
  if (pts.length === 0) return null;
  const axis = depth % 2;
  const sorted = [...pts].sort((a, b) => a[axis] - b[axis]);
  const mid = Math.floor(sorted.length / 2);
  return {
    point: sorted[mid],
    axis,
    left: build(sorted.slice(0, mid), depth + 1),
    right: build(sorted.slice(mid + 1), depth + 1),
  };
}

function dist2(a, b) {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function kd_nearest(points, query) {
  const root = build(points, 0);
  const best = { point: null, dist: Infinity };

  function search(node) {
    if (node === null) return;
    const d = dist2(node.point, query);
    if (d < best.dist) {
      best.dist = d;
      best.point = node.point;
    }

    const axis = node.axis;
    const diff = query[axis] - node.point[axis];
    const near = diff < 0 ? node.left : node.right;
    const far = diff < 0 ? node.right : node.left;

    search(near);
    if (diff * diff < best.dist) search(far);
  }

  search(root);
  return best.point;
}
