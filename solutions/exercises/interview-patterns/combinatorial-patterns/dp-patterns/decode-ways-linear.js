function num_decodings(s) {
  if (!s.length || s[0] === "0") return 0;

  let prev2 = 1; // dp[i - 2]
  let prev1 = 1; // dp[i - 1]
  for (let i = 1; i < s.length; i++) {
    let current = 0;
    if (s[i] !== "0") current += prev1;
    const twoDigit = parseInt(s.slice(i - 1, i + 1), 10);
    if (twoDigit >= 10 && twoDigit <= 26) current += prev2;
    prev2 = prev1;
    prev1 = current;
  }

  return prev1;
}
