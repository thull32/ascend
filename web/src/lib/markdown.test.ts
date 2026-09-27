import { describe, expect, it } from "vitest";
import { escapeCurrency } from "./markdown";

describe("escapeCurrency", () => {
  it("escapes money written as prose", () => {
    expect(escapeCurrency("costs $0.02 per GB, so $400k per month")).toBe("costs \\$0.02 per GB, so $400k per month");
    expect(escapeCurrency("$5 each and $6 each and $7 each")).toBe("\\$5 each and \\$6 each and $7 each");
  });
  it("leaves inline maths alone, including maths that starts with a number", () => {
    for (const m of [
      "$O(n \\log n)$",
      "$10^9$",
      "$2$",
      "$x_1$",
      "$\\alpha$",
      "$n/m$",
      "$4 \\times 10^7 \\times 5\\ \\text{Mbps} = 2 \\times 10^8$ Mbps",
      "$2 + 3$",
      "$$ 5 \\cdot 3 $$",
    ])
      expect(escapeCurrency(m)).toBe(m);
  });
  it("handles money followed by maths in the same paragraph", () => {
    expect(escapeCurrency("It costs $5 per run, and $x^2$ grows.")).toBe("It costs \\$5 per run, and $x^2$ grows.");
  });
  it("does not double-escape", () => {
    expect(escapeCurrency("\\$5 each and \\$6 each")).toBe("\\$5 each and \\$6 each");
  });
  it("skips code and scopes pairs to a paragraph", () => {
    const src = "price `$5 a` and\n```bash\necho $5 $6\n```\nthen $7 and\n\n$8 later";
    expect(escapeCurrency(src)).toBe(src);
    expect(escapeCurrency("pay $7 now and $8 later")).toBe("pay \\$7 now and $8 later");
  });
});
