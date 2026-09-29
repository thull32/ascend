function closest_pair_squared(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  function dist2(a, b) {
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  }

  function brute(p) {
    let best = Infinity;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        const d = dist2(p[i], p[j]);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function rec(p) {
    const n = p.length;
    if (n <= 3) return brute(p);
    const mid = Math.floor(n / 2);
    const midX = p[mid][0];
    const dLeft = rec(p.slice(0, mid));
    const dRight = rec(p.slice(mid));
    let d = Math.min(dLeft, dRight);

    const strip = p.filter((pt) => (pt[0] - midX) ** 2 < d);
    strip.sort((a, b) => a[1] - b[1]);
    for (let i = 0; i < strip.length; i++) {
      for (let j = i + 1; j < strip.length; j++) {
        if ((strip[j][1] - strip[i][1]) ** 2 >= d) break;
        const cur = dist2(strip[i], strip[j]);
        if (cur < d) d = cur;
      }
    }
    return d;
  }

  return rec(pts);
}
