import { expect, test } from "bun:test";
import {
  builtInProviders,
  catalogSchema,
  SCHEMA_VERSION,
} from "../packages/berth/src/index.ts";
import { fixture } from "../packages/berth/tests/fixture.ts";
import { buildCatalog, sortKeys } from "./build-catalog.ts";
import { checkCatalog } from "./check-catalog.ts";

const good = () => ({
  schemaVersion: SCHEMA_VERSION,
  generatedAt: "2026-12-01T00:00:00.000Z",
  providers: [sortKeys(fixture())],
});

test("build output is deterministic and checks clean", () => {
  const a = JSON.stringify(buildCatalog("2026-12-01T00:00:00.000Z"));
  expect(JSON.stringify(buildCatalog("2026-12-01T00:00:00.000Z"))).toBe(a);
  const built = JSON.parse(a);
  expect(built.schemaVersion).toBe(SCHEMA_VERSION);
  expect(checkCatalog(built, catalogSchema)).toEqual([]);
});

test("sortKeys orders keys recursively", () => {
  expect(
    JSON.stringify(sortKeys({ b: 1, a: { d: 1, c: [{ z: 1, y: 2 }] } })),
  ).toBe('{"a":{"c":[{"y":2,"z":1}],"d":1},"b":1}');
});

test("a valid catalog passes", () => {
  expect(checkCatalog(good(), catalogSchema)).toEqual([]);
});

test("schema violations are reported", () => {
  const c = good() as any;
  c.providers[0].meta.status = "bogus";
  delete c.providers[0].meta.name;
  const errs = checkCatalog(c, catalogSchema);
  expect(errs.join("\n")).toContain("status");
  expect(errs.join("\n")).toContain('missing required "name"');
});

test("validator violations are reported", () => {
  const c = good() as any;
  c.providers[0].types[0].regions = ["nowhere"];
  expect(checkCatalog(c, catalogSchema).join("\n")).toContain("nowhere");
});

test("all registered data validates against the schema", () => {
  const built = JSON.parse(JSON.stringify(buildCatalog()));
  expect(built.providers.length).toBe(builtInProviders.length);
  expect(built.providers.length).toBeGreaterThan(0);
  for (const p of built.providers)
    expect(checkCatalog({ ...built, providers: [p] }, catalogSchema)).toEqual(
      [],
    );
});

test("schema keeps additionalProperties false on every object", () => {
  const c = good() as any;
  c.providers[0].types[0].bogusField = 1;
  expect(checkCatalog(c, catalogSchema).join("\n")).toContain("bogusField");
  const walk = (s: any): void => {
    if (s && typeof s === "object") {
      if (s.type === "object" && s.properties)
        expect(s.additionalProperties).toBe(false);
      Object.values(s).forEach(walk);
    }
  };
  walk(catalogSchema);
});
