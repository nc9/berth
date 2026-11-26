import {
  canApply,
  UnsupportedError,
  type EgressSpec,
  type ProviderInfo,
} from "@nc9/berth-sdk";
import type { E2bNetwork, E2bSandboxInfo } from "./transport.ts";

/** E2B's "all traffic" CIDR (`ALL_TRAFFIC` in the e2b package). */
export const ALL_TRAFFIC = "0.0.0.0/0";

/** E2B's default DNS server, reachable whenever allowOut has a domain. */
export const DEFAULT_DNS = "8.8.8.8";

const CIDR_OR_IP = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

/**
 * Maps an egress request onto E2B's controls
 * (https://docs.e2b.dev/sandbox/internet-access):
 * - open: no restriction;
 * - none: `allowInternetAccess: false`;
 * - allowlist: `allowOut` the entries and `denyOut` all traffic (allow beats
 *   deny). Domains match only HTTP (80) Host and TLS (443) SNI.
 * `denyOut` takes IPs and CIDRs only, so a domain deny list is not
 * expressible; the berth contract has none, and anything else is refused.
 * Throws UnsupportedError before any network call.
 */
export function mapEgress(
  info: Pick<ProviderInfo, "network">,
  egress: EgressSpec,
): E2bNetwork | undefined {
  const check = canApply(info, egress);
  if (!check.ok) throw new UnsupportedError(`e2b: ${check.reason}`);
  switch (egress.policy) {
    case "open":
      return undefined;
    case "none":
      return { allowInternetAccess: false };
    case "allowlist": {
      const cidrs = egress.cidrs ?? [];
      for (const c of cidrs) {
        if (!CIDR_OR_IP.test(c))
          throw new UnsupportedError(
            `e2b: "${c}" is not an IPv4 address or CIDR`,
          );
      }
      const domains = egress.domains ?? [];
      for (const d of domains) {
        if (d === "" || d.includes("/") || d === "*" || CIDR_OR_IP.test(d))
          throw new UnsupportedError(`e2b: "${d}" is not a valid domain`);
      }
      const allowOut = [...domains, ...cidrs];
      return allowOut.length === 0
        ? { allowInternetAccess: false }
        : { allowOut, denyOut: [ALL_TRAFFIC] };
    }
    default:
      throw new UnsupportedError(
        `e2b: egress policy "${egress.policy}" is not supported`,
      );
  }
}

/** The egress E2B reports for a sandbox, in berth terms. */
export function readEgress(info: E2bSandboxInfo): EgressSpec {
  const denyAll =
    info.allowInternetAccess === false ||
    (info.network?.denyOut?.includes(ALL_TRAFFIC) ?? false);
  if (!denyAll) return { policy: "open" };
  // allowOut beats deny, so entries stay reachable even with internet off.
  const allow = info.network?.allowOut ?? [];
  if (allow.length === 0) return { policy: "none" };
  const domains = allow.filter((e) => !CIDR_OR_IP.test(e));
  const cidrs = allow.filter((e) => CIDR_OR_IP.test(e));
  // With a domain allowed, E2B also allows its DNS servers (8.8.8.8 by default).
  if (domains.length > 0)
    for (const dns of info.network?.dnsServers ?? [DEFAULT_DNS])
      if (!cidrs.includes(dns)) cidrs.push(dns);
  return { policy: "allowlist", domains, cidrs };
}
