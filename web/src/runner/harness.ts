// Shared comparison logic used by the JS worker (directly) and mirrored in
// the Python harness. Kept dependency-free so it can be inlined in a worker.

export function canon(v: unknown): string {
  return JSON.stringify(normalise(v));
}

export function normalise(v: unknown): unknown {
  if (v === undefined) return null;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    for (const tag of ["$list", "$tree", "$graph"]) if (tag in o && Array.isArray(o[tag]) && (o[tag] as unknown[]).length === 0) return null;
  }
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "number") return Math.round(v * 1e6) / 1e6;
  if (Array.isArray(v)) return v.map(normalise);
  if (v instanceof Map) return normalise(Object.fromEntries(v));
  if (v instanceof Set) return normalise([...v]);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) out[k] = normalise(o[k]);
    return out;
  }
  return v;
}

export function matches(expected: unknown, actual: unknown, anyOrder: boolean): boolean {
  if (anyOrder && Array.isArray(expected) && Array.isArray(actual)) {
    const a = expected.map(canon).sort();
    const b = actual.map(canon).sort();
    return a.length === b.length && a.every((x, i) => x === b[i]);
  }
  return canon(expected) === canon(actual);
}
