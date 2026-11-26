import { describe, expect, test } from "bun:test";
import { catalog, validateProviders } from "../src/index.ts";
import { providers } from "../src/data/index.ts";

const type = (p: string, id: string) => {
  const t = catalog.getType(p, id);
  if (!t) throw new Error(`missing type ${p}/${id}`);
  return t;
};

describe("native providers", () => {
  test("default catalog has the three providers and validates", () => {
    expect(catalog.getProviders().map((p) => p.id)).toEqual([
      "aws",
      "azure",
      "gcp",
      "daytona",
      "modal",
      "e2b",
    ]);
    expect(validateProviders(providers)).toEqual([]);
  });

  test("every rate carries sourceUrl, verifiedAt and raw", () => {
    for (const t of catalog.getTypes())
      for (const r of t.price?.rates ?? []) {
        expect(r.sourceUrl).toStartWith("https://");
        expect(r.verifiedAt).toBe("2026-11-26");
        expect(r.raw).toBeDefined();
      }
  });

  test("daytona classes, egress and pause", () => {
    const d = catalog.getProvider("daytona")!;
    expect(catalog.getTypes("daytona").map((t) => t.isolation)).toContain(
      "linux-vm",
    );
    expect(type("daytona", "windows").os).toEqual(["windows"]);
    expect(d.capabilities?.egress).toMatchObject({
      domainMax: 100,
      cidrMax: 10,
      mutuallyExclusive: true,
    });
    expect(d.capabilities?.snapshots?.memory).toBe(true);
    expect(type("daytona", "linux-vm").capabilities?.pause?.supported).toBe(
      true,
    );
    expect(type("daytona", "container").capabilities?.pause).toBeUndefined();
  });

  test("modal minimums, no pause, combinable egress", () => {
    const m = catalog.getProvider("modal")!;
    const t = type("modal", "sandbox");
    expect(t.price?.minimums).toEqual({ vcpu: 0.25, memoryMiB: 128 });
    expect(t.price?.rates[0]?.raw?.value).toBe(0.00003942);
    expect(m.capabilities?.pause?.supported).toBe(false);
    expect(m.capabilities?.egress?.mutuallyExclusive).toBe(false);
    expect(m.capabilities?.egress?.domainMatch).toBe("sni");
  });

  test("e2b pause keeps memory", () => {
    expect(catalog.getProvider("e2b")?.capabilities?.pause).toEqual({
      supported: true,
      keepsMemory: true,
    });
  });

  test("estimateCost reproduces the research per-hour numbers", () => {
    const hour = (p: string, id: string, extra = {}) =>
      catalog.estimateCost(type(p, id), {
        seconds: 3600,
        vcpu: 1,
        memoryMiB: 1024,
        ...extra,
      });
    // Modal: $0.071 per vCPU-hour, ~$0.024 per GiB-hour.
    const modalCpu = hour("modal", "sandbox").breakdown;
    expect(modalCpu[0]!.usd).toBeCloseTo(0.071, 3);
    expect(modalCpu[1]!.usd).toBeCloseTo(0.024, 3);
    for (const p of ["daytona", "e2b"] as const) {
      const b = hour(p, p === "daytona" ? "container" : "template").breakdown;
      expect(b[0]!.usd).toBeCloseTo(0.0504, 6);
      expect(b[1]!.usd).toBeCloseTo(0.0162, 6);
    }
  });

  test("estimateCost one GPU hour", () => {
    const gpu = (id: string, p: string) =>
      catalog
        .estimateCost(type(p, id), { seconds: 3600, vcpu: 1, memoryMiB: 1024 })
        .breakdown.find((l) => l.dimension === "gpu")!.usd;
    expect(gpu("gpu-h100", "modal")).toBeCloseTo(3.949, 3);
    expect(gpu("gpu-h100", "daytona")).toBeCloseTo(2.47, 6);
  });

  test("find h100 returns Daytona and Modal types", () => {
    const found = catalog.find({ gpuType: "h100" });
    expect(found.map((t) => `${t.provider}/${t.id}`).sort()).toEqual([
      "daytona/gpu-h100",
      "modal/gpu-h100",
    ]);
  });
});
