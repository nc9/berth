import { describe, expect, test } from "bun:test";
import { createCatalog } from "../src/index.ts";
import { fixture } from "./fixture.ts";

const c = createCatalog([fixture()]);
const small = c.getType("acme", "small")!;
const gpu = c.getType("acme", "gpu")!;

describe("estimateCost", () => {
  test("per-second wall-clock: rate x size x time", () => {
    const r = c.estimateCost(small, {
      seconds: 7200,
      vcpu: 2,
      memoryMiB: 4096,
    });
    expect(r.usd).toBeCloseTo(2 * 2 * 0.036 + 4 * 2 * 0.0072, 10);
    expect(r.billing).toBe("wall-clock");
    expect(r.breakdown).toHaveLength(2);
    expect(r.verifiedAt).toBe("2026-11-26");
  });
  test("rounds up to granularity", () => {
    const t = structuredClone(small);
    t.price!.minimums = undefined;
    const a = c.estimateCost(t, { seconds: 0.2, vcpu: 1, memoryMiB: 1024 });
    const b = c.estimateCost(t, { seconds: 1, vcpu: 1, memoryMiB: 1024 });
    expect(a.usd).toBeCloseTo(b.usd, 12);
    t.price!.granularity = "min";
    const m = c.estimateCost(t, { seconds: 61, vcpu: 1, memoryMiB: 1024 });
    const m2 = c.estimateCost(t, { seconds: 120, vcpu: 1, memoryMiB: 1024 });
    expect(m.usd).toBeCloseTo(m2.usd, 12);
  });
  test("minimum billed duration", () => {
    const short = c.estimateCost(small, {
      seconds: 5,
      vcpu: 1,
      memoryMiB: 1024,
    });
    const min = c.estimateCost(small, {
      seconds: 60,
      vcpu: 1,
      memoryMiB: 1024,
    });
    expect(short.usd).toBeCloseTo(min.usd, 12);
    expect(short.usd).toBeGreaterThan(0);
  });
  test("region multiplier", () => {
    const base = c.estimateCost(small, {
      seconds: 3600,
      vcpu: 1,
      memoryMiB: 1024,
      region: "us-east",
    });
    const eu = c.estimateCost(small, {
      seconds: 3600,
      vcpu: 1,
      memoryMiB: 1024,
      region: "eu-west",
    });
    expect(eu.breakdown[0]!.usd).toBeCloseTo(base.breakdown[0]!.usd * 1.5, 12);
    expect(eu.breakdown[1]!.usd).toBeCloseTo(base.breakdown[1]!.usd, 12);
  });
  test("range types need a size; sizes must fit", () => {
    expect(() => c.estimateCost(small, { seconds: 10 })).toThrow(
      "vcpu is required",
    );
    expect(() =>
      c.estimateCost(small, { seconds: 10, vcpu: 9, memoryMiB: 1024 }),
    ).toThrow("outside");
    expect(() =>
      c.estimateCost(small, {
        seconds: 10,
        vcpu: 1,
        memoryMiB: 1024,
        region: "mars",
      }),
    ).toThrow("region");
  });
  test("GPU rate is per GPU", () => {
    const r = c.estimateCost(gpu, { seconds: 3600, cpuSeconds: 0 });
    const line = r.breakdown.find((l) => l.dimension === "gpu")!;
    expect(line.usd).toBeCloseTo(2 * 3, 12);
    const one = c.estimateCost(gpu, {
      seconds: 3600,
      cpuSeconds: 0,
      gpuCount: 1,
    });
    expect(one.usd).toBeCloseTo(3, 12);
    expect(r.verifiedAt).toBe("2026-11-01");
  });
  test("active-cpu uses cpuSeconds", () => {
    const r = c.estimateCost(gpu, { seconds: 3600, cpuSeconds: 1800 });
    const cpu = r.breakdown.find((l) => l.dimension === "vcpu")!;
    expect(cpu.usd).toBeCloseTo(0.5 * 0.1, 12);
  });
  test("active-cpu without cpuSeconds fails clearly", () => {
    expect(() => c.estimateCost(gpu, { seconds: 3600 })).toThrow(
      "requires usage.cpuSeconds",
    );
  });
});
