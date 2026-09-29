def _build(pts, depth):
    if not pts:
        return None
    axis = depth % 2
    pts_sorted = sorted(pts, key=lambda p: p[axis])
    mid = len(pts_sorted) // 2
    return {
        "point": pts_sorted[mid],
        "axis": axis,
        "left": _build(pts_sorted[:mid], depth + 1),
        "right": _build(pts_sorted[mid + 1:], depth + 1),
    }


def _dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2


def kd_nearest(points, query):
    root = _build(points, 0)
    best = {"point": None, "dist": float("inf")}

    def search(node):
        if node is None:
            return
        d = _dist2(node["point"], query)
        if d < best["dist"]:
            best["dist"] = d
            best["point"] = node["point"]

        axis = node["axis"]
        diff = query[axis] - node["point"][axis]
        near, far = (node["left"], node["right"]) if diff < 0 else (node["right"], node["left"])

        search(near)
        if diff * diff < best["dist"]:
            search(far)

    search(root)
    return best["point"]
