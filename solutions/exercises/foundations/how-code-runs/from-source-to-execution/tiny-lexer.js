function tokens(src) {
  const result = [];
  const isAlpha = (c) => /[A-Za-z_]/.test(c);
  const isAlnum = (c) => /[A-Za-z0-9_]/.test(c);
  const isDigit = (c) => /[0-9]/.test(c);
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " ") {
      i += 1;
      continue;
    }
    if (isAlpha(c)) {
      let j = i + 1;
      while (j < n && isAlnum(src[j])) j += 1;
      result.push(["name", src.slice(i, j)]);
      i = j;
    } else if (isDigit(c)) {
      let j = i + 1;
      while (j < n && isDigit(src[j])) j += 1;
      result.push(["number", src.slice(i, j)]);
      i = j;
    } else {
      result.push(["op", c]);
      i += 1;
    }
  }
  return result;
}
