def closest_pair_squared(points):
    pts = sorted(points)

    def dist2(a, b):
        return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

    def brute(p):
        best = float('inf')
        for i in range(len(p)):
            for j in range(i + 1, len(p)):
                d = dist2(p[i], p[j])
                if d < best:
                    best = d
        return best

    def rec(p):
        n = len(p)
        if n <= 3:
            return brute(p)
        mid = n // 2
        mid_x = p[mid][0]
        d_left = rec(p[:mid])
        d_right = rec(p[mid:])
        d = min(d_left, d_right)

        strip = [pt for pt in p if (pt[0] - mid_x) ** 2 < d]
        strip.sort(key=lambda pt: pt[1])
        for i in range(len(strip)):
            for j in range(i + 1, len(strip)):
                if (strip[j][1] - strip[i][1]) ** 2 >= d:
                    break
                cur = dist2(strip[i], strip[j])
                if cur < d:
                    d = cur
        return d

    return rec(pts)
