import { expect, test } from "bun:test";
import { catalogSchema, SCHEMA_VERSION } from "../packages/berth/src/index.ts";
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
