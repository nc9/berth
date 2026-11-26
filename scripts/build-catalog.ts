// Writes dist/catalog.json and dist/catalog.schema.json.
// Usage: bun scripts/build-catalog.ts
import { mkdirSync, writeFileSync } from "node:fs";
import {
  SCHEMA_VERSION,
  catalogSchema,
  builtInProviders as providers,
  validateProviders,
} from "../packages/berth/src/index.ts";

/** Recursively sorts object keys so output is deterministic. */
export function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (typeof v === "object" && v !== null)
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export function buildCatalog(generatedAt = new Date().toISOString()) {
  const errors = validateProviders(providers);
  if (errors.length > 0)
    throw new Error(`invalid catalog data:\n- ${errors.join("\n- ")}`);
  return sortKeys({
    schemaVersion: SCHEMA_VERSION,
    generatedAt,
    providers: [...providers].sort((a, b) =>
      a.meta.id.localeCompare(b.meta.id),
    ),
  });
}

if (import.meta.main) {
  const dist = new URL("../dist/", import.meta.url).pathname;
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    `${dist}catalog.json`,
    JSON.stringify(buildCatalog(), null, 2) + "\n",
  );
  writeFileSync(
    `${dist}catalog.schema.json`,
    JSON.stringify(sortKeys(catalogSchema), null, 2) + "\n",
  );
  console.log(`wrote ${dist}catalog.json and ${dist}catalog.schema.json`);
}
