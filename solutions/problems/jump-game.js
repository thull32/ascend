// Greedily track the furthest reachable index; if we ever reach an index
// beyond it, that index is unreachable.
function can_jump(nums) {
  let reach = 0;
  const last = nums.length - 1;
  for (let i = 0; i < nums.length; i++) {
    if (i > reach) return false; // a gap: index i is unreachable
    reach = Math.max(reach, i + nums[i]);
    if (reach >= last) return true;
  }
  return true;
}
