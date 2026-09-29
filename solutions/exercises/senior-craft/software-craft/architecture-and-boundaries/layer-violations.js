function find_violations(allowed, imports) {
  const violations = [];
  for (const [src, dst] of imports) {
    const srcLayer = src.split("/")[0];
    const dstLayer = dst.split("/")[0];
    if (dstLayer === srcLayer) continue;
    const list = allowed[srcLayer] || [];
    if (list.includes(dstLayer)) continue;
    violations.push([src, dst]);
  }
  return violations;
}
