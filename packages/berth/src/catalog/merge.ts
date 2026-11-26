import type { Provider } from "./types.ts";
import { SCHEMA_VERSION } from "./schema.ts";
import { validateProviders } from "./validate.ts";

export interface MergeOptions {
  /** Called once per problem with the remote data. Defaults to `console.warn`. */
  warn?: (message: string) => void;
}

const time = (s: string): number => Date.parse(s);

/**
 * Overlays a remote catalog document (a JSON string or parsed value) on the
 * built-in providers. Returns a new list; inputs are not mutated.
 *
 * - A remote provider replaces the built-in one only when its
 *   `meta.verifiedAt` is strictly newer.
 * - Providers the built-in list does not know are added.
 * - A malformed remote is ignored with a warning and the built-in list is
 *   returned unchanged. A single invalid remote provider is skipped with a
 *   warning; the rest still merge.
 */
export function mergeCatalog(
  builtIn: Provider[],
  remoteJson: unknown,
  opts: MergeOptions = {},
): Provider[] {
  const warn = opts.warn ?? ((m: string) => console.warn(m));
  const ignore = (why: string): Provider[] => {
    warn(`ignoring remote catalog: ${why}`);
    return [...builtIn];
  };

  let doc = remoteJson;
  if (typeof doc === "string") {
    try {
      doc = JSON.parse(doc);
    } catch {
      return ignore("not valid JSON");
    }
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc))
    return ignore("not an object");
  const { schemaVersion, providers } = doc as Record<string, unknown>;
  if (schemaVersion !== SCHEMA_VERSION)
    return ignore(
      `schemaVersion ${String(schemaVersion)} is not ${SCHEMA_VERSION}`,
    );
  if (!Array.isArray(providers)) return ignore("providers is not an array");

  const out = new Map(builtIn.map((p) => [p.meta.id, p]));
  const seen = new Set<string>();
  for (const [i, raw] of providers.entries()) {
    const remote = raw as Provider;
    if (
      typeof raw !== "object" ||
      raw === null ||
      typeof remote.meta !== "object" ||
      remote.meta === null ||
      !Array.isArray(remote.types) ||
      !Array.isArray(remote.meta.isolation) ||
      !Array.isArray(remote.meta.regions)
    ) {
      warn(`ignoring remote provider #${i}: malformed`);
      continue;
    }
    const id = remote.meta.id;
    let errors: string[];
    try {
      errors = validateProviders([remote]);
    } catch (e) {
      errors = [e instanceof Error ? e.message : String(e)];
    }
    if (errors.length > 0) {
      warn(`ignoring remote provider ${String(id)}: ${errors.join("; ")}`);
      continue;
    }
    if (seen.has(id)) {
      warn(`ignoring duplicate remote provider ${id}`);
      continue;
    }
    seen.add(id);
    const current = out.get(id);
    if (
      current === undefined ||
      time(remote.meta.verifiedAt) > time(current.meta.verifiedAt)
    )
      out.set(id, remote);
  }
  return [...out.values()];
}
