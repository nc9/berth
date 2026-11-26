// Validates dist/catalog.json against dist/catalog.schema.json and the
// validators. Exits non-zero on any error. Run `bun scripts/build-catalog.ts` first.
import { readFileSync } from "node:fs";
import { validateProviders } from "../packages/berth/src/index.ts";
import { checkSchema } from "../packages/berth/src/catalog/json-schema.ts";

export function checkCatalog(
  catalog: unknown,
  schema: Record<string, any>,
): string[] {
  const errs = checkSchema(schema, catalog);
  const providers = (catalog as { providers?: unknown })?.providers;
  if (errs.length === 0 && Array.isArray(providers))
    errs.push(...validateProviders(providers as never));
  return errs;
}

if (import.meta.main) {
  const dist = new URL("../dist/", import.meta.url).pathname;
  const read = (f: string) => {
    try {
      return JSON.parse(readFileSync(`${dist}${f}`, "utf8"));
    } catch (e) {
      console.error(`cannot read ${dist}${f}: ${(e as Error).message}`);
      process.exit(1);
    }
  };
  const errs = checkCatalog(read("catalog.json"), read("catalog.schema.json"));
  if (errs.length > 0) {
    console.error(`catalog check failed:\n- ${errs.join("\n- ")}`);
    process.exit(1);
  }
  console.log("catalog ok");
}
