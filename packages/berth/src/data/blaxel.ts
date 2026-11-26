import type { Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://blaxel.ai/pricing";

export const blaxel: Provider = {
  meta: {
    id: "blaxel",
    name: "Blaxel",
    website: "https://blaxel.ai",
    docs: "https://docs.blaxel.ai/Sandboxes/Overview",
    pricingUrl: PRICING,
    description: "VM sandboxes sized by memory, with standby and fast resume.",
    logo: { brandUrl: "https://blaxel.ai" },
    envVars: [],
    isolation: ["microvm"],
    regions: [{ id: "us-pdx-1", name: "Oregon", geo: "us", selectable: true }],
    sizingMode: "memory-only",
    freeTier: "Up to $200 free credit",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    {
      id: "sandbox",
      provider: "blaxel",
      kind: "free-form",
      vcpu: { min: 1, max: 6 },
      memoryMiB: { min: 1024, max: 16384 },
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "microvm",
      regions: ["us-pdx-1"],
      limits: { planGate: "Sandbox limits: Tier 0 10, Tier 1 50, Tier 2 200" },
      notes: [
        "Memory (MB) is set at create and CPU scales with it: 8 GB = 4 cores, 16 GB = 6. The vcpu and memory ranges here are bounds from those two examples, not a documented size list; the pair is not independent.",
        "Other regions (Virginia, London, Frankfurt) come from a third-party digest and are left out. Max lifetime, architecture and isolation technology are not documented ('VM' is mapped to microvm, unverified).",
        "Standby after about 15 s idle, resume under 25 ms (vendor claims). Standby snapshots filesystem, memory and processes; archive keeps the filesystem only.",
        "Memory-only billing: $0.0000115 per GB-second = $0.0414 per GB-hour. CPU is not billed. GB is treated as GiB. Snapshots $0.20, images $0.045 and volumes $0.12 per GB-month are not modelled.",
        "Egress: the Overview defers to a 'Proxy & network' page that was not read; a domain allowlist is unverified.",
      ],
      price: {
        currency: "USD",
        billing: "memory-only",
        granularity: "s",
        includedCreditUsd: 200,
        rates: [
          rate(
            "memory",
            "per-gib-hour",
            0.0000115 * 3600,
            { value: 0.0000115, unit: "USD per GB-second" },
            PRICING,
          ),
        ],
      },
      capabilities: {
        createFrom: ["image"],
        snapshots: { fs: true, memory: true, fork: true },
        pause: { supported: true, keepsMemory: true },
        ingress: true,
        labels: true,
        discovery: { types: false, regions: false, pricing: "docs" },
      },
    },
  ],
};
