function bpe_encode(word, merges) {
  let symbols = [...word];
  for (const [a, b] of merges) {
    const newSymbols = [];
    let i = 0;
    while (i < symbols.length) {
      if (i < symbols.length - 1 && symbols[i] === a && symbols[i + 1] === b) {
        newSymbols.push(a + b);
        i += 2;
      } else {
        newSymbols.push(symbols[i]);
        i += 1;
      }
    }
    symbols = newSymbols;
  }
  return symbols;
}
