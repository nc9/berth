import { describe, expect, test } from "bun:test";
import { catalog, estimateCost, validateProviders } from "../src/index.ts";
import { providers } from "../src/data/index.ts";

const NATIVE = [
  "boxd",
  "morph",
  "blaxel",
  "vercel",
  "cloudflare",
  "fly",
  "runloop",
  "northflank",
  "beam",
];

describe("native provider data", () => {
  test("whole catalog validates with zero errors", () => {
    expect(validateProviders(providers)).toEqual([]);
  });
  test("each native provider is present with at least one type", () => {
    for (const id of NATIVE) {
      expect(catalog.getProvider(id)).toBeDefined();
      expect(catalog.getTypes(id).length).toBeGreaterThan(0);
    }
  });
  test("billing bases", () => {
    expect(catalog.getType("vercel", "sandbox")?.price?.billing).toBe(
      "active-cpu+provisioned-memory",
    );
    for (const t of catalog.getTypes("cloudflare"))
      expect(t.price?.billing).toBe("active-cpu+provisioned-memory");
    expect(catalog.getType("blaxel", "sandbox")?.price?.billing).toBe(
      "memory-only",
    );
  });
  test("monthly plans keep the monthly raw value and note the conversion", () => {
    for (const [p, id] of [
      ["boxd", "individual"],
      ["fly", "shared-cpu-1x-1gb"],
    ] as const) {
      const t = catalog.getType(p, id)!;
      expect(t.price?.rates[0]?.raw?.unit).toContain("month");
      expect(t.notes?.join(" ")).toContain("730");
    }
  });
  test("runloop is unverified; closed-core is not used here", () => {
    expect(catalog.getProvider("runloop")?.status).toBe("unverified");
    for (const id of NATIVE)
      expect(catalog.getProvider(id)?.status).not.toBe("closed-core");
  });
  test("estimateCost on Vercel needs cpuSeconds", () => {
    const t = catalog.getType("vercel", "sandbox")!;
    const u = { seconds: 3600, vcpu: 2, memoryMiB: 4096 };
    expect(() => estimateCost(t, u)).toThrow("requires usage.cpuSeconds");
    const e = estimateCost(t, { ...u, cpuSeconds: 1800 });
    expect(e.usd).toBeCloseTo(0.5 * 0.128 + 4 * 0.0212, 10);
  });
});
