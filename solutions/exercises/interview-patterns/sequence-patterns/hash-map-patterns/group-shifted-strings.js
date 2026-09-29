function group_shifted(words) {
  const groups = new Map();
  const order = [];
  for (const w of words) {
    const gaps = [];
    for (let i = 1; i < w.length; i++) {
      gaps.push(((w.charCodeAt(i) - w.charCodeAt(i - 1)) % 26 + 26) % 26);
    }
    const key = w.length + ":" + gaps.join(",");
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(w);
  }
  return order.map((key) => groups.get(key));
}
