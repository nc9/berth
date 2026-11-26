import type { ContainerType, Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://beam.cloud/pricing";

function tier(
  id: string,
  name: string,
  cpu: number,
  mem: number,
): ContainerType {
  return {
    id,
    provider: "beam",
    kind: "free-form",
    vcpu: 1,
    memoryMiB: 1024,
    os: ["linux"],
    arch: ["x86_64"],
    isolation: "gvisor",
    regions: [],
    notes: [
      `${name} tier. Sandbox(cpu, memory) is free-form but limits were not read: 1 vCPU/1 GiB is a placeholder.`,
      "gVisor + runc by default; a microVM is opt-in with use_vm=True (third-party digest, unverified). Default lifetime 600 s (-1 = manual).",
      "Sandboxes bill per ms, per hour at the rates shown. GPUs (H100 $2.75, A100-80 $1.49, L40S $1.08, RTX 4090 $0.66, from-prices) are not modelled. $20 monthly credit on Developer.",
      "Egress allowlists up to 64 CIDRs are unverified (third-party digest).",
    ],
    price: {
      currency: "USD",
      billing: "wall-clock",
      granularity: "ms",
      rates: [
        rate(
          "vcpu",
          "per-vcpu-hour",
          cpu,
          { value: cpu, unit: "USD per vCPU-hour" },
          PRICING,
        ),
        rate(
          "memory",
          "per-gib-hour",
          mem,
          { value: mem, unit: "USD per GiB-hour" },
          PRICING,
        ),
      ],
    },
    capabilities: {
      createFrom: ["image"],
      snapshots: { fs: true, memory: false, fork: true },
      discovery: { types: false, regions: false, pricing: "docs" },
    },
  };
}

export const beam: Provider = {
  meta: {
    id: "beam",
    name: "Beam",
    website: "https://beam.cloud",
    docs: "https://docs.beam.cloud/v2/sandbox/overview",
    pricingUrl: PRICING,
    description:
      "Sandbox(cpu, memory, image) on gVisor, with an optional microVM.",
    logo: { brandUrl: "https://beam.cloud" },
    envVars: [],
    isolation: ["gvisor", "microvm"],
    regions: [],
    sizingMode: "free-form",
    freeTier: "Developer: $20 monthly credit",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    tier("performance", "Performance", 0.05, 0.01),
    tier("shared", "Shared", 0.011, 0.0055),
    tier("spot", "Spot", 0.0063, 0.00135),
  ],
};
