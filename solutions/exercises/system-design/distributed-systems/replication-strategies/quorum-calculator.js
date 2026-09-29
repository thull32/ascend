function comb(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

function gcd(a, b) {
  while (b) {
    [a, b] = [b, a % b];
  }
  return a;
}

function quorum_properties(n, w, r) {
  const min_overlap = Math.max(0, w + r - n);
  const overlap = min_overlap >= 1;

  const write_failures_tolerated = n - w;
  const read_failures_tolerated = n - r;

  const missSets = r <= n - w ? comb(n - w, r) : 0;
  const totalSets = comb(n, r);

  let p_miss;
  if (missSets === 0) {
    p_miss = [0, 1];
  } else {
    const g = gcd(missSets, totalSets);
    p_miss = [missSets / g, totalSets / g];
  }

  return {
    overlap,
    min_overlap,
    write_failures_tolerated,
    read_failures_tolerated,
    p_miss,
  };
}
