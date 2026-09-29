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
  it("never lets a dollar pair with an author-escaped one", () => {
    expect(escapeCurrency("costs $5 and later \\$10 more")).toBe("costs \\$5 and later \\$10 more");
    expect(escapeCurrency("For $10n^2$ versus $1000 n \\log n$ and \\$3")).toBe("For $10n^2$ versus $1000 n \\log n$ and \\$3");
  });
  it("does not double-escape", () => {
    expect(escapeCurrency("\\$5 each and \\$6 each")).toBe("\\$5 each and \\$6 each");
  });
  it("scopes pairs to a table cell, as remark-math does", () => {
    const table = [
      "| Item | Cost | Share |",
      "|---|---|---|",
      "| Storage | 2 PB at $0.02/GB | 25% |",
      "| Egress | 486 TB at $0.05/GB (tiers start at $0.09, so about 16% more) | $24,300 |",
    ].join("\n");
    expect(escapeCurrency(table)).toBe(
      [
        "| Item | Cost | Share |",
        "|---|---|---|",
        "| Storage | 2 PB at $0.02/GB | 25% |",
        "| Egress | 486 TB at \\$0.05/GB (tiers start at $0.09, so about 16% more) | $24,300 |",
      ].join("\n"),
    );
    // Maths inside a cell is still maths, and an escaped pipe is not a cell break.
    const maths = "| a | $O(n \\log n)$ | x \\| y $5 |";
    expect(escapeCurrency(maths)).toBe(maths);
  });
  it("skips code and scopes pairs to a paragraph", () => {
    const src = "price `$5 a` and\n```bash\necho $5 $6\n```\nthen $7 and\n\n$8 later";
    expect(escapeCurrency(src)).toBe(src);
    expect(escapeCurrency("pay $7 now and $8 later")).toBe("pay \\$7 now and $8 later");
  });
});
