function calls(n) {
  if (n <= 1) return 1;
  return 1 + calls(Math.floor(n / 2)) + calls(n - Math.floor(n / 2));
}
