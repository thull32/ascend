// Floyd's cycle detection over the sum-of-squares-of-digits sequence: happy
// numbers reach 1, unhappy numbers loop forever, so a cycle means unhappy.
function is_happy(n) {
  function step(x) {
    let total = 0;
    while (x) {
      const d = x % 10;
      x = Math.floor(x / 10);
      total += d * d;
    }
    return total;
  }

  let slow = n, fast = step(n);
  while (fast !== 1 && slow !== fast) {
    slow = step(slow);
    fast = step(step(fast));
  }
  return fast === 1;
}
