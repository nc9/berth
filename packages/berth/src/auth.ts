import { checkAuthConfig } from "./catalog/auth.ts";
import type { AuthConfigResult } from "./catalog/auth.ts";
import { providers } from "./data/index.ts";

/**
 * Validates a consumer's stored auth config against the built-in catalog.
 * Call with field PRESENCE: `"present"` for secret fields, the value for
 * non-secret ones. Never pass a secret value.
 */
export function validateAuthConfig(
  providerId: string,
  methodId: string,
  config: Record<string, string>,
): AuthConfigResult {
  return checkAuthConfig(providers, providerId, methodId, config);
}
