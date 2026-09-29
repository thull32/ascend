function bpe_merge_step(words) {
  const counts = new Map();
  for (const word of words) {
    for (let i = 0; i < word.length - 1; i++) {
      const key = JSON.stringify([word[i], word[i + 1]]);
      if (counts.has(key)) {
        counts.get(key).count += 1;
      } else {
        counts.set(key, { pair: [word[i], word[i + 1]], count: 1 });
      }
    }
  }

  if (counts.size === 0) {
    return { merged: null, words: words };
  }

  let bestPair = null;
  let bestCount = -1;
  for (const { pair, count } of counts.values()) {
    if (count > bestCount) {
      bestCount = count;
      bestPair = pair;
    }
  }

  const merged = bestPair[0] + bestPair[1];
  const newWords = [];
  for (const word of words) {
    const newWord = [];
    let i = 0;
    while (i < word.length) {
      if (i < word.length - 1 && word[i] === bestPair[0] && word[i + 1] === bestPair[1]) {
        newWord.push(merged);
        i += 2;
      } else {
        newWord.push(word[i]);
        i += 1;
      }
    }
    newWords.push(newWord);
  }
  return { merged: merged, words: newWords };
}
