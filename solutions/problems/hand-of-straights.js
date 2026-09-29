// Greedily build straights starting from the smallest remaining card;
// consume group_size cards starting at v from every value's count.
function can_form_straights(hand, group_size) {
  if (hand.length % group_size !== 0) return false;
  const count = new Map();
  for (const x of hand) count.set(x, (count.get(x) || 0) + 1);
  const values = [...count.keys()].sort((a, b) => a - b);
  for (const v of values) {
    const c = count.get(v);
    if (c === 0) continue; // fully consumed by earlier straights
    for (let w = v; w < v + group_size; w++) {
      const cw = count.get(w) || 0;
      if (cw < c) return false;
      count.set(w, cw - c);
    }
  }
  return true;
}
