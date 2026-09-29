function ladder_length(begin, end, words) {
  const wordSet = new Set(words);
  if (!wordSet.has(end)) return 0;
  wordSet.delete(begin);

  const queue = [[begin, 1]];
  let head = 0;
  while (head < queue.length) {
    const [word, steps] = queue[head++];
    if (word === end) return steps;
    for (let i = 0; i < word.length; i++) {
      for (let code = 97; code <= 122; code++) {
        const c = String.fromCharCode(code);
        if (c === word[i]) continue;
        const candidate = word.slice(0, i) + c + word.slice(i + 1);
        if (wordSet.has(candidate)) {
          wordSet.delete(candidate);
          queue.push([candidate, steps + 1]);
        }
      }
    }
  }
  return 0;
}
