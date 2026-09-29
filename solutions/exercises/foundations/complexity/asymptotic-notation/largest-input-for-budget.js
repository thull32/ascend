function largest_input(budget, cls) {
  function floorLog2(n) {
    return 31 - Math.clz32(n);
  }
  function cost(n) {
    if (cls === "linear") return n;
    if (cls === "linearithmic") return n * floorLog2(n);
    if (cls === "quadratic") return n * n;
    if (cls === "cubic") return n * n * n;
    if (cls === "exponential") return 2 ** n;
    if (cls === "factorial") {
      let f = 1;
      for (let i = 2; i <= n; i++) f *= i;
      return f;
    }
    throw new Error("unknown class");
  }

  if (cost(1) > budget) return 0;

  let lo = 1;
  let hi = 2;
  while (cost(hi) <= budget) {
    hi *= 2;
  }

  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (cost(mid) <= budget) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}
