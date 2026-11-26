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

describe("boat.dev", () => {
  test("is registered with its four documented sizes", () => {
    expect(catalog.getProvider("boatdev")?.website).toBe("https://boat.dev");
    expect(
      catalog
        .getTypes("boatdev")
        .map((t) => t.id)
        .sort(),
    ).toEqual(["default", "large", "small", "xlarge"]);
  });
  test("find returns boat.dev types for linux and a size", () => {
    const found = catalog
      .find({ os: "linux", minVcpu: 16, minMemoryMiB: 32768 })
      .filter((t) => t.provider === "boatdev");
    expect(found.map((t) => t.id)).toEqual(["xlarge"]);
    const all = catalog.find({ os: "linux", region: "de" });
    expect(all.filter((t) => t.provider === "boatdev")).toHaveLength(4);
    expect(
      catalog.find({ os: "windows" }).some((t) => t.provider === "boatdev"),
    ).toBe(false);
  });
  test("prices carry raw, source and date; egress is not documented", () => {
    for (const t of catalog.getTypes("boatdev"))
      for (const r of t.price!.rates) {
        expect(r.raw?.unit).toContain("per hour");
        expect(r.sourceUrl).toStartWith("https://docs.boat.dev/");
        expect(r.verifiedAt).toBeTruthy();
      }
    expect(
      catalog.getProvider("boatdev")?.capabilities?.egress,
    ).toBeUndefined();
    expect(
      catalog
        .find({ egress: "allowlist" })
        .some((t) => t.provider === "boatdev"),
    ).toBe(false);
  });
});
