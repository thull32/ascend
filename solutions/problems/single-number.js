// Single Number: XOR everything; every paired value cancels itself out.
function single_number(nums) {
  let acc = 0;
  for (const x of nums) {
    acc ^= x;
  }
  return acc;
}
