const HEADER_PREFIXES = ["---", "+++", "@@", "diff --git", "index "];
const SKIP_PATTERNS = ["@pytest.mark.skip", "#[ignore]", "it.skip(", "test.skip(", "xit("];
const SWALLOW_PATTERNS = ["except Exception: pass", "catch {}", "catch (e) {}"];
const SILENCE_PATTERNS = ["# type: ignore", "// @ts-ignore", "#[allow("];

function flag_test_diff(diff) {
  if (!diff) return [];

  const out = [];
  for (const line of diff.split("\n")) {
    if (HEADER_PREFIXES.some(p => line.startsWith(p))) continue;

    if (line.startsWith("-")) {
      const text = line.slice(1).trim();
      if (text.startsWith("assert ") || text.startsWith("assert(") || text.includes("expect(")) {
        out.push(`removed-assertion: ${text}`);
      }
    } else if (line.startsWith("+")) {
      const text = line.slice(1).trim();
      if (SKIP_PATTERNS.some(p => text.includes(p))) {
        out.push(`added-skip: ${text}`);
      } else if (SWALLOW_PATTERNS.some(p => text.includes(p))) {
        out.push(`swallowed-error: ${text}`);
      } else if (SILENCE_PATTERNS.some(p => text.includes(p))) {
        out.push(`silenced-checker: ${text}`);
      }
    }
  }

  return out;
}
