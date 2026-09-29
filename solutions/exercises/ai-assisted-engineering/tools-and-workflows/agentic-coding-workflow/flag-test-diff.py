HEADER_PREFIXES = ("---", "+++", "@@", "diff --git", "index ")
SKIP_PATTERNS = ("@pytest.mark.skip", "#[ignore]", "it.skip(", "test.skip(", "xit(")
SWALLOW_PATTERNS = ("except Exception: pass", "catch {}", "catch (e) {}")
SILENCE_PATTERNS = ("# type: ignore", "// @ts-ignore", "#[allow(")


def flag_test_diff(diff):
    if not diff:
        return []

    out = []
    for line in diff.split("\n"):
        if line.startswith(HEADER_PREFIXES):
            continue

        if line.startswith("-"):
            text = line[1:].strip()
            if text.startswith("assert ") or text.startswith("assert(") or "expect(" in text:
                out.append(f"removed-assertion: {text}")
        elif line.startswith("+"):
            text = line[1:].strip()
            if any(p in text for p in SKIP_PATTERNS):
                out.append(f"added-skip: {text}")
            elif any(p in text for p in SWALLOW_PATTERNS):
                out.append(f"swallowed-error: {text}")
            elif any(p in text for p in SILENCE_PATTERNS):
                out.append(f"silenced-checker: {text}")

    return out
