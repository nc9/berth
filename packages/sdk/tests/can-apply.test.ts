import { expect, test } from "bun:test";
import {
  canApply,
  type EgressPolicy,
  type ProviderInfo,
} from "../src/index.ts";

const all: EgressPolicy[] = [
  "none",
  "open",
  "allowlist",
  "deny-all-except-proxy",
  "proxy-domain-filtered",
];
const net = (
  n: Partial<ProviderInfo["network"]>,
): Pick<ProviderInfo, "network"> => ({
  network: { egressPolicy: all, ingress: false, ...n },
});

test("every policy is accepted when listed and refused when not", () => {
  for (const p of all) {
    expect(canApply(net({}), { policy: p })).toEqual({ ok: true });
    const r = canApply(net({ egressPolicy: all.filter((x) => x !== p) }), {
      policy: p,
    });
    expect(r.ok).toBe(false);
  }
});

test("domain and cidr limits", () => {
  const info = net({ domainMax: 2, cidrMax: 1 });
  expect(
    canApply(info, {
      policy: "allowlist",
      domains: ["a", "b"],
      cidrs: ["1.0.0.0/8"],
    }).ok,
  ).toBe(true);
  expect(
    canApply(info, { policy: "allowlist", domains: ["a", "b", "c"] }).ok,
  ).toBe(false);
  expect(canApply(info, { policy: "allowlist", cidrs: ["a", "b"] }).ok).toBe(
    false,
  );
});

test("mutual exclusion", () => {
  const info = net({ mutuallyExclusive: true });
  expect(
    canApply(info, {
      policy: "allowlist",
      domains: ["a"],
      cidrs: ["1.0.0.0/8"],
    }).ok,
  ).toBe(false);
  expect(canApply(info, { policy: "allowlist", domains: ["a"] }).ok).toBe(true);
  expect(
    canApply(net({}), { policy: "allowlist", domains: ["a"], cidrs: ["x"] }).ok,
  ).toBe(true);
});
