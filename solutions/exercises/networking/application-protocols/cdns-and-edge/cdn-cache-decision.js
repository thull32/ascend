// Decide what a shared cache does with a stored response.

function cache_decision(cache_control, age) {
  const directives = new Map();
  for (let part of cache_control.split(",")) {
    part = part.trim().toLowerCase();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq !== -1) {
      directives.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
    } else {
      directives.set(part, null);
    }
  }

  if (directives.has("no-store") || directives.has("private")) return "bypass";
  if (directives.has("no-cache")) return "revalidate";

  let lifetime;
  if (directives.has("s-maxage")) {
    lifetime = parseInt(directives.get("s-maxage"), 10);
  } else if (directives.has("max-age")) {
    lifetime = parseInt(directives.get("max-age"), 10);
  } else {
    lifetime = 0;
  }

  if (age < lifetime) return "fresh";

  const swr = directives.has("stale-while-revalidate")
    ? parseInt(directives.get("stale-while-revalidate"), 10)
    : 0;
  if (age < lifetime + swr) return "stale-while-revalidate";

  return "revalidate";
}
