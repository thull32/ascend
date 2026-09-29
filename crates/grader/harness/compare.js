// When a returned value matches an expected one: the ONE definition of the
// rule. The browser imports it (web/src/runner/harness.ts) and runs it in V8;
// the server's grader runs this same file in a fresh QuickJS instance on the
// host side, after the learner's code has finished (crates/grader/src/sandbox.rs),
// so the learner's code never sees expected values. conformance.json pins the
// behaviour; `export` keywords are stripped when the server embeds this file,
// so keep every export a plain `export function`.
//
// Rules: floats compare after Math.round(v * 1e6) / 1e6 (halves towards
// +infinity) and an integral float equals the integer; object keys compare in
// any order; an empty $list/$tree/$graph equals null; with any_order, two
// arrays match when they hold the same elements with the same multiplicities.

/** @param {unknown} v @returns {unknown} */
export function normalise(v) {
  if (v === undefined) return null;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const tag of ["$list", "$tree", "$graph"]) if (tag in v && Array.isArray(v[tag]) && v[tag].length === 0) return null;
  }
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(normalise);
  if (v instanceof Map) return normalise(Object.fromEntries(v));
  if (v instanceof Set) return normalise([...v]);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = normalise(v[k]);
    return out;
  }
  return v;
}

/** The canonical text of a value: equal values have equal text. @param {unknown} v @returns {string} */
export function canon(v) {
  return JSON.stringify(normalise(v));
}

/** @param {unknown} expected @param {unknown} actual @param {boolean} anyOrder @returns {boolean} */
export function matches(expected, actual, anyOrder) {
  if (anyOrder && Array.isArray(expected) && Array.isArray(actual)) {
    const a = expected.map(canon).sort();
    const b = actual.map(canon).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return canon(expected) === canon(actual);
}
