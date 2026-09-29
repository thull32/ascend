function to_int32(n) {
  const m = 2 ** 32;
  let v = (n + 2 ** 31) % m;
  if (v < 0) v += m;
  return v - 2 ** 31;
}
