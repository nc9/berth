import type { CanApplyResult, EgressSpec, ProviderInfo } from "./types.ts";

/** Pure check: can this provider enforce the requested egress? */
export function canApply(
  info: Pick<ProviderInfo, "network">,
  egress: EgressSpec,
): CanApplyResult {
  const net = info.network;
  if (!net.egressPolicy.includes(egress.policy)) {
    return {
      ok: false,
      reason: `egress policy "${egress.policy}" is not supported`,
    };
  }
  const domains = egress.domains?.length ?? 0;
  const cidrs = egress.cidrs?.length ?? 0;
  if (net.domainMax !== undefined && domains > net.domainMax) {
    return {
      ok: false,
      reason: `${domains} domains exceeds the maximum of ${net.domainMax}`,
    };
  }
  if (net.cidrMax !== undefined && cidrs > net.cidrMax) {
    return {
      ok: false,
      reason: `${cidrs} CIDRs exceeds the maximum of ${net.cidrMax}`,
    };
  }
  if (net.mutuallyExclusive && domains > 0 && cidrs > 0) {
    return { ok: false, reason: "domains and CIDRs cannot be combined" };
  }
  return { ok: true };
}
