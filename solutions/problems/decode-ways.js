// Climbing-Stairs style DP with conditions on the one- and two-digit moves,
// rolled to two variables.
function num_decodings(s) {
  let twoBack = 0;
  let oneBack = 1;
  for (let i = 1; i <= s.length; i++) {
    let current = 0;
    if (s[i - 1] !== "0") {
      current += oneBack;
    }
    if (i >= 2) {
      const pair = s.slice(i - 2, i);
      if (pair >= "10" && pair <= "26") {
        current += twoBack;
      }
    }
    twoBack = oneBack;
    oneBack = current;
  }
  return oneBack;
}
