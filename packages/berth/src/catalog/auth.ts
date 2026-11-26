import type { AuthMethod, ProviderMeta } from "./types.ts";

/** Env var names of the default method's fields, in order. */
export function envVarsFromAuth(auth: AuthMethod[]): string[] {
  const m = auth.find((a) => a.default === true);
  return m ? m.fields.map((f) => f.env) : [];
}

export interface AuthConfigResult {
  /** Required fields with no value. */
  missing: string[];
  /** Config keys that are not fields of the method. */
  unknown: string[];
  /** Secret fields given something other than `"present"`. Never echo these values. */
  inlineSecrets: string[];
  ok: boolean;
}

/**
 * Checks a stored auth config against the catalog. Pure: pass `"present"` for
 * secret fields (never the secret itself) and the value for non-secret ones.
 */
export function checkAuthConfig(
  providers: readonly { meta: ProviderMeta }[],
  providerId: string,
  methodId: string,
  config: Record<string, string>,
): AuthConfigResult {
  const provider = providers.find((p) => p.meta.id === providerId);
  if (!provider) throw new Error(`unknown provider "${providerId}"`);
  const method = provider.meta.auth.find((m) => m.id === methodId);
  if (!method)
    throw new Error(`unknown auth method "${methodId}" on ${providerId}`);
  const names = new Set(method.fields.map((f) => f.name));
  const has = (k: string) => {
    const v = config[k];
    return typeof v === "string" && v !== "";
  };
  const missing = method.fields
    .filter((f) => f.required && !has(f.name))
    .map((f) => f.name);
  const unknown = Object.keys(config).filter((k) => !names.has(k));
  const inlineSecrets = method.fields
    .filter((f) => f.secret && has(f.name) && config[f.name] !== "present")
    .map((f) => f.name);
  return {
    missing,
    unknown,
    inlineSecrets,
    ok: !missing.length && !unknown.length && !inlineSecrets.length,
  };
}
