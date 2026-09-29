const LOCKFILES = new Set(["Cargo.lock", "pnpm-lock.yaml"]);

function stripExt(segment) {
  const idx = segment.indexOf(".");
  return idx === -1 ? segment : segment.slice(0, idx);
}

function review_tier(files) {
  const categories = new Set();
  let hasOrdinary = false;
  let lines = 0;

  for (const [path, added, deleted] of files) {
    const segments = path.split("/");
    const name = segments[segments.length - 1];

    const isAuth = segments.some((seg) => stripExt(seg) === "auth");
    const isMigration = path.startsWith("migration/");
    const isCi = path.startsWith(".github/workflows/") || name === "Dockerfile";
    const isDeps = name === "Cargo.toml" || name === "package.json";
    const isLockfile = LOCKFILES.has(name);

    if (isAuth) categories.add("auth");
    if (isMigration) categories.add("migration");
    if (isCi) categories.add("ci");
    if (isDeps) categories.add("dependencies");

    if (!(isAuth || isMigration || isCi || isDeps)) {
      const isLow =
        name.endsWith(".md") ||
        path.includes("/tests/") ||
        path.startsWith("tests/") ||
        name.endsWith(".test.ts") ||
        isLockfile;
      if (!isLow) hasOrdinary = true;
    }

    if (!isLockfile) lines += added + deleted;
  }

  let tier;
  if (categories.has("auth") || categories.has("migration") || categories.has("ci")) {
    tier = "high";
  } else if (categories.has("dependencies") || hasOrdinary) {
    tier = "medium";
  } else {
    tier = "low";
  }

  return {
    tier,
    reasons: Array.from(categories).sort(),
    lines,
    split: lines > 400,
  };
}
