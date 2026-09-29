function digitSquareSum(n) {
  let total = 0;
  while (n > 0) {
    const d = n % 10;
    total += d * d;
    n = Math.floor(n / 10);
  }
  return total;
}

function is_happy(n) {
  let slow = n;
  let fast = digitSquareSum(n);
  while (fast !== 1 && slow !== fast) {
    slow = digitSquareSum(slow);
    fast = digitSquareSum(digitSquareSum(fast));
  }
  return fast === 1;
}
