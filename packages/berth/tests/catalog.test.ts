import { describe, expect, test } from "bun:test";
import { catalog, createCatalog } from "../src/index.ts";
import { fixture } from "./fixture.ts";

const c = createCatalog([fixture()]);
const ids = (r: { id: string }[]) => r.map((t) => t.id).sort();

describe("catalog", () => {
  test("default catalog holds the cloud and native providers", () => {
    expect(catalog.getProviders().map((p) => p.id)).toEqual([
      "aws",
      "azure",
      "gcp",
      "boxd",
      "morph",
      "blaxel",
      "vercel",
      "cloudflare",
      "fly",
      "runloop",
      "northflank",
      "beam",
    ]);
  });
  test("lookups", () => {
    expect(c.getProviders().map((p) => p.id)).toEqual(["acme"]);
    expect(c.getProvider("acme")?.name).toBe("Acme");
    expect(c.getProvider("nope")).toBeUndefined();
    expect(ids(c.getTypes())).toEqual(["gpu", "small"]);
    expect(c.getTypes("nope")).toEqual([]);
    expect(c.getType("acme", "gpu")?.id).toBe("gpu");
    expect(c.getType("acme", "nope")).toBeUndefined();
  });
  test("find filters", () => {
    expect(ids(c.find())).toEqual(["gpu", "small"]);
    expect(ids(c.find({ arch: "arm64" }))).toEqual(["gpu"]);
    expect(ids(c.find({ os: "windows" }))).toEqual([]);
    expect(ids(c.find({ gpuType: "h100" }))).toEqual(["gpu"]);
    expect(ids(c.find({ gpuType: "h100", gpuCount: 2 }))).toEqual(["gpu"]);
    expect(ids(c.find({ gpuCount: 3 }))).toEqual([]);
    expect(ids(c.find({ gpuType: "l4" }))).toEqual([]);
    expect(ids(c.find({ minVcpu: 8 }))).toEqual(["gpu"]);
    expect(ids(c.find({ minVcpu: 4 }))).toEqual(["gpu", "small"]);
    expect(ids(c.find({ minMemoryMiB: 16384 }))).toEqual(["gpu"]);
    expect(ids(c.find({ region: "eu-west" }))).toEqual(["small"]);
    expect(ids(c.find({ minIsolation: "microvm" }))).toEqual(["gpu"]);
    expect(ids(c.find({ minIsolation: "container" }))).toEqual([
      "gpu",
      "small",
    ]);
    expect(ids(c.find({ egress: "open" }))).toEqual(["small"]);
    expect(ids(c.find({ egress: "allowlist" }))).toEqual(["gpu"]);
    expect(ids(c.find({ status: "ga" }))).toEqual(["gpu", "small"]);
    expect(ids(c.find({ status: "preview" }))).toEqual([]);
  });
});
