function max_product_word_lengths(words) {
  const masks = words.map((w) => {
    let mask = 0;
    for (const ch of w) {
      mask |= 1 << (ch.charCodeAt(0) - 97);
    }
    return mask;
  });

  let best = 0;
  const n = words.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((masks[i] & masks[j]) === 0) {
        const product = words[i].length * words[j].length;
        if (product > best) best = product;
      }
    }
  }
  return best;
}
