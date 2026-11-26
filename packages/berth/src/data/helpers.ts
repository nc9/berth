import type { Rate, RateDimension, RateUnit } from "../catalog/types.ts";

/** Day the research in `research/clouds.md` was read. */
export const READ_AT = "2026-11-26";

/**
 * Builds a rate. `raw` is the vendor's own number and unit; `unverified` marks
 * a third-party or unconfirmed value.
 */
export function rate(
  dimension: RateDimension,
  unit: RateUnit,
  usd: number,
  raw: { value: number; unit: string },
  sourceUrl: string,
  unverified = false,
): Rate {
  return {
    dimension,
    unit,
    usd,
    raw,
    ...(unverified ? { unverified: true } : {}),
    verifiedAt: READ_AT,
    sourceUrl,
  };
}
