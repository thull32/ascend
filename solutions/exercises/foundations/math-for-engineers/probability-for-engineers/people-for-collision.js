function people_for_collision(space, p) {
  let q = 1.0;
  let n = 0;
  while (true) {
    q *= (space - n) / space;
    n += 1;
    if (1 - q >= p) return n;
  }
}
