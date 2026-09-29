// Letter Combinations of a Phone Number — backtracking, one level per digit.
function letter_combinations(digits) {
  if (!digits) return [];
  const keypad = {
    "2": "abc", "3": "def", "4": "ghi", "5": "jkl",
    "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz",
  };
  const result = [];
  const path = [];

  function backtrack(i) {
    if (i === digits.length) {
      result.push(path.join(""));
      return;
    }
    for (const ch of keypad[digits[i]]) {
      path.push(ch);
      backtrack(i + 1);
      path.pop();
    }
  }

  backtrack(0);
  return result;
}
