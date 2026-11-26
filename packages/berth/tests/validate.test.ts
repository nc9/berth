import { describe, expect, test } from "bun:test";
import {
  createCatalog,
  validateContainerType,
  validateProvider,
} from "../src/index.ts";
import { fixture } from "./fixture.ts";

const meta = () => fixture().meta;
const type = () => structuredClone(fixture().types[0]!);
const has = (errs: string[], s: string) =>
  expect(errs.some((e) => e.includes(s))).toBe(true);

describe("validators", () => {
  test("fixture is valid", () => {
    expect(validateProvider(meta())).toEqual([]);
    for (const t of fixture().types)
      expect(validateContainerType(t, meta())).toEqual([]);
  });
  test("kebab-case ids", () => {
    has(validateProvider({ ...meta(), id: "Acme_X" }), "kebab-case");
    has(validateContainerType({ ...type(), id: "Big One" }), "kebab-case");
  });
  test("https urls", () => {
    has(
      validateProvider({ ...meta(), website: "http://example.com" }),
      "website",
    );
    has(validateProvider({ ...meta(), docs: "nope" }), "docs");
  });
  test("ISO verifiedAt", () => {
    has(validateProvider({ ...meta(), verifiedAt: "yesterday" }), "verifiedAt");
    const t = type();
    t.price!.rates[0]!.verifiedAt = "26/11/2026";
    has(validateContainerType(t), "verifiedAt");
  });
  test("every rate has a sourceUrl", () => {
    const t = type();
    t.price!.rates[0]!.sourceUrl = "";
    has(validateContainerType(t), "sourceUrl");
  });
  test("integer MiB", () => {
    has(validateContainerType({ ...type(), memoryMiB: 1024.5 }), "memoryMiB");
    has(
      validateContainerType({
        ...type(),
        memoryMiB: { min: 512, max: 1000.5 },
      }),
      "memoryMiB",
    );
  });
  test("range min <= max", () => {
    has(
      validateContainerType({ ...type(), vcpu: { min: 4, max: 1 } }),
      "greater than max",
    );
  });
  test("GPU types are canonical", () => {
    const t = fixture().types[1]!;
    has(
      validateContainerType({
        ...t,
        gpu: [{ type: "h100-fake" as never, count: 1 }],
      }),
      "canonical",
    );
  });
  test("type regions exist on provider", () => {
    has(
      validateContainerType({ ...type(), regions: ["mars"] }, meta()),
      "does not exist",
    );
  });
  test("no duplicate ids", () => {
    const p = fixture();
    expect(() => createCatalog([p, fixture()])).toThrow(
      "duplicate provider id",
    );
    p.types.push(structuredClone(p.types[0]!));
    expect(() => createCatalog([p])).toThrow("duplicate type id");
  });
  test("createCatalog lists all errors", () => {
    const p = fixture();
    p.meta.docs = "x";
    p.types[0]!.id = "BAD";
    expect(() => createCatalog([p])).toThrow(/docs[\s\S]*kebab-case/);
  });
});
