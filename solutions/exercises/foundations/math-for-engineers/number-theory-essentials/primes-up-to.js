function primes_up_to(n) {
  if (n < 2) return [];
  const isPrime = new Array(n + 1).fill(true);
  isPrime[0] = false;
  isPrime[1] = false;
  for (let i = 2; i * i <= n; i++) {
    if (isPrime[i]) {
      for (let j = i * i; j <= n; j += i) {
        isPrime[j] = false;
      }
    }
  }
  const result = [];
  for (let x = 2; x <= n; x++) {
    if (isPrime[x]) result.push(x);
  }
  return result;
}
