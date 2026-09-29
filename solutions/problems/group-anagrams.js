// Key each string by its 26-letter count signature so anagrams collide.
function group_anagrams(strs) {
  const groups = new Map();
  for (const s of strs) {
    const counts = new Array(26).fill(0);
    for (const ch of s) counts[ch.charCodeAt(0) - 97] += 1;
    const key = counts.join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.values()].map((g) => [...g].sort());
}
