function run_length_encode(s) {
  const parts = [];
  const n = s.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && s[j] === s[i]) j++;
    const runLen = j - i;
    parts.push(s[i]);
    if (runLen > 1) parts.push(String(runLen));
    i = j;
  }
  return parts.join("");
}
