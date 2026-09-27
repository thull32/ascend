import { describe, expect, it } from "vitest";
import { escapeCurrency } from "./markdown";

describe("escapeCurrency", () => {
  it("escapes money", () => {
    expect(escapeCurrency("costs $0.02 per GB, so $400k per month")).toBe("costs \\$0.02 per GB, so \\$400k per month");
    expect(escapeCurrency("$1,000.50 and $3/month and $2bn")).toBe("\\$1,000.50 and \\$3/month and \\$2bn");
  });
  it("leaves inline maths alone", () => {
    for (const m of ["$O(n \\log n)$", "$10^9$", "$2$", "$x_1$", "$\\alpha$", "$n/m$"]) expect(escapeCurrency(m)).toBe(m);
  });
  it("does not double-escape", () => {
    expect(escapeCurrency("\\$5 each")).toBe("\\$5 each");
  });
  it("skips code", () => {
    const src = "price `$5` and\n```bash\necho $5 $6\n```\nthen $7 and $8";
    expect(escapeCurrency(src)).toBe("price `$5` and\n```bash\necho $5 $6\n```\nthen \\$7 and \\$8");
  });
});
