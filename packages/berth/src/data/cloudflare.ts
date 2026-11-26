import { envVarsFromAuth } from "../catalog/auth.ts";
import { AUTH } from "./auth.ts";
import type { ContainerType, Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING =
  "https://developers.cloudflare.com/containers/platform/pricing/";

const price: ContainerType["price"] = {
  currency: "USD",
  billing: "active-cpu+provisioned-memory",
  granularity: "10ms",
  rates: [
    rate(
      "vcpu",
      "per-vcpu-hour",
      0.00002 * 3600,
      { value: 0.00002, unit: "USD per vCPU-second (active)" },
      PRICING,
    ),
    rate(
      "memory",
      "per-gib-hour",
      0.0000025 * 3600,
      { value: 0.0000025, unit: "USD per GiB-second" },
      PRICING,
    ),
    rate(
      "disk",
      "per-gib-hour",
      0.00000007 * 3600,
      { value: 0.00000007, unit: "USD per GB-second" },
      PRICING,
    ),
  ],
};

const NOTES = [
  "Active-CPU billing: CPU is charged only while used, so estimateCost needs usage.cpuSeconds. Memory and disk are charged on provisioned size. Billing granularity 10 ms. Disk GB is treated as GiB.",
  "Included on Workers Paid: 25 GiB-h memory, 375 vCPU-min, 200 GB-h disk (not modelled).",
  "Regions are not selectable (third-party digest).",
];

function size(
  id: string,
  vcpu: number,
  memoryMiB: number,
  diskGiB: number,
  frac: string,
): ContainerType {
  return {
    id,
    provider: "cloudflare",
    kind: "preset",
    vcpu,
    memoryMiB,
    diskGiB,
    os: ["linux"],
    arch: ["x86_64"],
    isolation: "microvm",
    regions: [],
    notes: [`instance_type "${id}": ${frac} vCPU.`, ...NOTES],
    price,
    capabilities: {
      createFrom: ["image"],
      egress: { policies: ["open", "none"] },
      discovery: { types: false, regions: false, pricing: "docs" },
    },
  };
}

export const cloudflare: Provider = {
  meta: {
    id: "cloudflare",
    name: "Cloudflare (Sandbox SDK on Containers)",
    website: "https://developers.cloudflare.com/sandbox/",
    docs: "https://developers.cloudflare.com/sandbox/",
    pricingUrl: PRICING,
    description:
      "Sandbox SDK running on Cloudflare Containers; each instance is a microVM with a named instance_type.",
    logo: { simpleIcons: "cloudflare" },
    auth: AUTH.cloudflare,
    envVars: envVarsFromAuth(AUTH.cloudflare),
    isolation: ["microvm"],
    regions: [],
    sizingMode: "presets",
    freeTier: "unverified (Workers Paid included usage only)",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    size("lite", 0.0625, 256, 2, "1/16"),
    size("basic", 0.25, 1024, 4, "1/4"),
    size("standard-1", 0.5, 4096, 8, "1/2"),
    size("standard-2", 1, 6144, 12, "1"),
    size("standard-3", 2, 8192, 16, "2"),
    size("standard-4", 4, 12288, 20, "4"),
  ],
};
