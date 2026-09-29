function bcnf_violations(attributes, fds) {
  function closure(xs) {
    const result = new Set(xs);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [lhs, rhs] of fds) {
        if (lhs.every((a) => result.has(a)) && !rhs.every((a) => result.has(a))) {
          for (const a of rhs) result.add(a);
          changed = true;
        }
      }
    }
    return result;
  }

  const allAttrs = new Set(attributes);
  const violations = [];
  for (const [lhs, rhs] of fds) {
    if (rhs.every((a) => lhs.includes(a))) continue; // trivial
    const cl = closure(lhs);
    if (cl.size !== allAttrs.size || ![...allAttrs].every((a) => cl.has(a))) {
      violations.push([lhs, rhs]);
    }
  }
  return violations;
}
