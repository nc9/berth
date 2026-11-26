import { expect, test } from "bun:test";
import { mergeCatalog, SCHEMA_VERSION } from "../src/index.ts";
import type { Provider } from "../src/index.ts";
import { fixture } from "./fixture.ts";

const doc = (providers: unknown[]) => ({
  schemaVersion: SCHEMA_VERSION,
  generatedAt: "2026-12-01T00:00:00Z",
  providers,
});
const withDate = (p: Provider, id: string, verifiedAt: string): Provider => {
  const c = structuredClone(p);
  c.meta.id = id;
  c.meta.verifiedAt = verifiedAt;
  for (const t of c.types) t.provider = id;
  return c;
};
const run = (builtIn: Provider[], remote: unknown) => {
  const warnings: string[] = [];
  const out = mergeCatalog(builtIn, remote, { warn: (m) => warnings.push(m) });
  return { out, warnings };
};

test("remote wins when verifiedAt is newer", () => {
  const base = fixture();
  const newer = withDate(base, "acme", "2026-12-01");
  newer.meta.description = "remote";
  const { out, warnings } = run([base], doc([newer]));
  expect(out[0]!.meta.description).toBe("remote");
  expect(warnings).toEqual([]);
});

test("built-in wins when remote is older or equal", () => {
  const base = fixture();
  for (const d of ["2026-01-01", base.meta.verifiedAt]) {
    const remote = withDate(base, "acme", d);
    remote.meta.description = "remote";
    expect(run([base], doc([remote])).out[0]!.meta.description).toBe(
      "Fixture provider",
    );
  }
});

test("unknown providers are added", () => {
  const base = fixture();
  const { out } = run([base], doc([withDate(base, "other", "2026-01-01")]));
  expect(out.map((p) => p.meta.id)).toEqual(["acme", "other"]);
});

test("accepts a JSON string", () => {
  const base = fixture();
  const { out } = run(
    [base],
    JSON.stringify(doc([withDate(base, "other", "2026-01-01")])),
  );
  expect(out).toHaveLength(2);
});

test("malformed remote is ignored with a warning", () => {
  const base = fixture();
  for (const bad of [
    "{not json",
    null,
    [],
    { schemaVersion: 99, providers: [] },
    { schemaVersion: SCHEMA_VERSION, providers: "x" },
  ]) {
    const { out, warnings } = run([base], bad);
    expect(out).toEqual([base]);
    expect(warnings).toHaveLength(1);
  }
});

test("an invalid remote provider is skipped, valid ones still merge", () => {
  const base = fixture();
  const broken = withDate(base, "broken", "2026-12-01");
  broken.meta.website = "http://not-https";
  const { out, warnings } = run(
    [base],
    doc([broken, 5, withDate(base, "good", "2026-12-01")]),
  );
  expect(out.map((p) => p.meta.id)).toEqual(["acme", "good"]);
  expect(warnings).toHaveLength(2);
});

test("does not mutate the built-in list", () => {
  const base = fixture();
  const list = [base];
  run(list, doc([withDate(base, "other", "2026-01-01")]));
  expect(list).toEqual([base]);
});
