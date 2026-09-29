// Missing Number: XOR every index 0..n with every array value; unmatched value survives.
function missing_number(nums) {
  const n = nums.length;
  let acc = n;
  for (let i = 0; i < n; i++) {
    acc ^= i ^ nums[i];
  }
  return acc;
}
