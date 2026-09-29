// Replace Words: trie of roots; for each sentence word, walk until the first
// end-of-root flag (shortest matching root) or fall off / exhaust the word.
function replace_words(dictionary, sentence) {
  const root = {};
  for (const r of dictionary) {
    let node = root;
    for (const ch of r) {
      if (!(ch in node)) node[ch] = {};
      node = node[ch];
    }
    node["$"] = true;
  }

  function shorten(word) {
    let node = root;
    for (let i = 0; i < word.length; i++) {
      if ("$" in node) return word.slice(0, i);
      const ch = word[i];
      if (!(ch in node)) return word;
      node = node[ch];
    }
    return word;
  }

  return sentence.split(" ").map(shorten).join(" ");
}
