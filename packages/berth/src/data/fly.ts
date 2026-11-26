import { envVarsFromAuth } from "../catalog/auth.ts";
import { AUTH } from "./auth.ts";
import type { ContainerType, Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const MACHINES = "https://docs.fly.io/about/pricing";
const SPRITES = "https://fly.io/sprites";
const HOURS_PER_MONTH = 730;

function preset(
  id: string,
  vcpu: number,
  memoryMiB: number,
  monthly: number,
  label: string,
): ContainerType {
  return {
    id,
    provider: "fly",
    service: "machines",
    kind: "preset",
    vcpu,
    memoryMiB,
    os: ["linux"],
    arch: ["x86_64"],
    isolation: "microvm",
    regions: ["iad", "ewr"],
    notes: [
      `${label}: $${monthly}/month (iad/ewr). Derived hourly rate = ${monthly} / 730 h, spread over ${vcpu} vCPU(s) as a per-vCPU-hour rate; memory is included, not billed separately. Billing is per second while running; the monthly figure is the always-on cost.`,
      "Stopped machines cost $0.15/GB-month of rootfs (not modelled). Sizes and regions are listable through the Machines API (not read: unverified). Isolation is Firecracker (unverified).",
    ],
    price: {
      currency: "USD",
      billing: "wall-clock",
      granularity: "s",
      rates: [
        rate(
          "vcpu",
          "per-vcpu-hour",
          monthly / HOURS_PER_MONTH / vcpu,
          { value: monthly, unit: `USD per month (${label})` },
          MACHINES,
        ),
      ],
    },
    capabilities: {
      createFrom: ["image"],
      discovery: { types: true, regions: true, pricing: "docs" },
    },
  };
}

export const fly: Provider = {
  meta: {
    id: "fly",
    name: "Fly (Machines and Sprites)",
    website: "https://fly.io",
    docs: "https://docs.fly.io",
    pricingUrl: MACHINES,
    description:
      "Fly Machines presets with monthly list prices, and Sprites hardware-isolated Linux VMs billed by the hour.",
    logo: { simpleIcons: "flydotio" },
    auth: AUTH.fly,
    envVars: envVarsFromAuth(AUTH.fly),
    isolation: ["microvm"],
    regions: [
      { id: "iad", name: "Ashburn", geo: "us", selectable: true },
      { id: "ewr", name: "Secaucus", geo: "us", selectable: true },
    ],
    sizingMode: "presets",
    freeTier: "Sprites: $5/month free plan usage",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    preset("shared-cpu-1x-256mb", 1, 256, 2.19, "shared-cpu-1x 256 MB"),
    preset("shared-cpu-1x-1gb", 1, 1024, 6.7, "shared-cpu-1x 1 GB"),
    preset("shared-cpu-2x-2gb", 2, 2048, 13.39, "shared-cpu-2x 2 GB"),
    preset("performance-1x-2gb", 1, 2048, 33, "performance-1x 2 GB"),
    preset("performance-2x-4gb", 2, 4096, 66, "performance-2x 4 GB"),
    {
      id: "sprite",
      provider: "fly",
      service: "sprites",
      kind: "free-form",
      vcpu: 1,
      memoryMiB: 1024,
      diskGiB: 100,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "microvm",
      regions: [],
      notes: [
        "Sprite CPU and memory sizes are not documented on the page read: 1 vCPU/1 GiB is a placeholder. Pass vcpu and memoryMiB only if they match.",
        "Hardware-isolated Linux VM; 100 GB volume. Isolation class microvm is unverified. Regions are not documented.",
        "Rates: $0.0385/CPU-h, $0.021875/GB-h (GB treated as GiB). Hot storage $0.000683/GB-h and cold $0.000027/GB-h are not modelled.",
        "Checkpoints take about 1 s (copy-on-write); restore rewinds files and does not resume processes. Warm/cold sleep, wake on HTTP.",
        "Egress: 'MCP servers can run with an egress policy'; a DNS allowlist is unverified.",
      ],
      price: {
        currency: "USD",
        billing: "wall-clock",
        granularity: "s",
        includedCreditUsd: 5,
        rates: [
          rate(
            "vcpu",
            "per-vcpu-hour",
            0.0385,
            { value: 0.0385, unit: "USD per CPU-hour" },
            SPRITES,
          ),
          rate(
            "memory",
            "per-gib-hour",
            0.021875,
            { value: 0.021875, unit: "USD per GB-hour" },
            SPRITES,
          ),
        ],
      },
      capabilities: {
        createFrom: ["image"],
        snapshots: { fs: true, memory: false, fork: false },
        pause: { supported: true, keepsMemory: false },
        ingress: true,
        discovery: { types: false, regions: false, pricing: "docs" },
      },
    },
  ],
};
