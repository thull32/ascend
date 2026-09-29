_LOCKFILES = {"Cargo.lock", "pnpm-lock.yaml"}


def _strip_ext(segment):
    idx = segment.find(".")
    return segment if idx == -1 else segment[:idx]


def review_tier(files):
    categories = set()
    has_ordinary = False
    lines = 0

    for path, added, deleted in files:
        segments = path.split("/")
        name = segments[-1]

        is_auth = any(_strip_ext(seg) == "auth" for seg in segments)
        is_migration = path.startswith("migration/")
        is_ci = path.startswith(".github/workflows/") or name == "Dockerfile"
        is_deps = name in ("Cargo.toml", "package.json")
        is_lockfile = name in _LOCKFILES

        if is_auth:
            categories.add("auth")
        if is_migration:
            categories.add("migration")
        if is_ci:
            categories.add("ci")
        if is_deps:
            categories.add("dependencies")

        if not (is_auth or is_migration or is_ci or is_deps):
            is_low = (
                name.endswith(".md")
                or "/tests/" in path
                or path.startswith("tests/")
                or name.endswith(".test.ts")
                or is_lockfile
            )
            if not is_low:
                has_ordinary = True

        if not is_lockfile:
            lines += added + deleted

    if categories & {"auth", "migration", "ci"}:
        tier = "high"
    elif "dependencies" in categories or has_ordinary:
        tier = "medium"
    else:
        tier = "low"

    return {
        "tier": tier,
        "reasons": sorted(categories),
        "lines": lines,
        "split": lines > 400,
    }
