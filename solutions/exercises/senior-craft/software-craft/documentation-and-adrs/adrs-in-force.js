function in_force(adrs) {
  const superseded = new Set();
  for (const a of adrs) {
    if (a.status === "accepted") {
      for (const id of a.supersedes) superseded.add(id);
    }
  }
  return adrs
    .filter((a) => a.status === "accepted" && !superseded.has(a.id))
    .sort((a, b) => a.id - b.id)
    .map((a) => a.title);
}
