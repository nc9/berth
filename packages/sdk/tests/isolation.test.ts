import { expect, test } from "bun:test";
import { ISOLATION_ORDER, isolationAtLeast } from "../src/index.ts";

test("isolationAtLeast", () => {
  for (const [i, have] of ISOLATION_ORDER.entries()) {
    for (const [j, need] of ISOLATION_ORDER.entries()) {
      expect(isolationAtLeast(have, need)).toBe(i >= j);
    }
  }
});
