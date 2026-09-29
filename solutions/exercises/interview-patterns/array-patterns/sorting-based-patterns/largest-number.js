function largest_number(nums) {
  const strs = nums.map((n) => String(n));
  strs.sort((a, b) => {
    const ab = a + b, ba = b + a;
    if (ab > ba) return -1;
    if (ab < ba) return 1;
    return 0;
  });
  if (strs[0] === "0") return "0";
  return strs.join("");
}
