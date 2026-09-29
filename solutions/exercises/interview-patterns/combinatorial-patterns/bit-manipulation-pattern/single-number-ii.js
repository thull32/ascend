function single_number_ii(nums) {
  let result = 0;
  for (let b = 0; b < 32; b++) {
    let count = 0;
    for (const x of nums) {
      if ((x >> b) & 1) count += 1;
    }
    if (count % 3 === 1) {
      result |= 1 << b;
    }
  }
  return result;
}
