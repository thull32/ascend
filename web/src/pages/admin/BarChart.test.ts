import { describe, expect, it } from "vitest";
import { niceCeil } from "./BarChart";

describe("niceCeil", () => {
  it("rounds the axis top up to 1, 2 or 5 times a power of ten", () => {
    expect([0, 1, 3, 7, 10, 11, 23, 180, 501, 4_999].map(niceCeil)).toEqual([1, 1, 5, 10, 10, 20, 50, 200, 1000, 5000]);
  });
});
