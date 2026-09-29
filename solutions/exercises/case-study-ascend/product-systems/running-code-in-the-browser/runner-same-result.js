function canonical(v) {
  if (typeof v === "boolean") return ["bool", v];
  if (typeof v === "number") {
    if (Number.isInteger(v)) return ["num", v];
    return ["num", Math.round(v * 1e6) / 1e6];
  }
  if (typeof v === "string") return ["str", v];
  if (v === null) return ["null"];
  if (Array.isArray(v)) return ["list", v.map(canonical)];
  if (typeof v === "object") {
    const keys = Object.keys(v).sort();
    return ["dict", keys.map((k) => [k, canonical(v[k])])];
  }
  return ["other", v];
}

function same_result(expected, actual, any_order) {
  if (any_order && Array.isArray(expected) && Array.isArray(actual)) {
    const ce = expected.map((x) => JSON.stringify(canonical(x))).sort();
    const ca = actual.map((x) => JSON.stringify(canonical(x))).sort();
    return JSON.stringify(ce) === JSON.stringify(ca);
  }
  return JSON.stringify(canonical(expected)) === JSON.stringify(canonical(actual));
}
