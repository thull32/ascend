function gray_code(n) {
  let result = [0];
  for (let b = 0; b < n; b++) {
    const reflected = [...result].reverse().map((x) => x | (1 << b));
    result = result.concat(reflected);
  }
  return result;
}
