import type { Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://docs.boxd.sh/reference/pricing";
const HOURS_PER_MONTH = 730;

export const boxd: Provider = {
  meta: {
    id: "boxd",
    name: "boxd",
    website: "https://boxd.sh",
    docs: "https://docs.omnara.com/machines/providers/boxd",
    pricingUrl: PRICING,
    description:
      "KVM microVM sandboxes, Ubuntu 24.04, persistent by default with sleep and resume.",
    logo: { brandUrl: "https://boxd.sh" },
    envVars: [],
    isolation: ["microvm"],
    regions: [
      {
        id: "eu",
        name: "EU data centres (exact locations not documented)",
        geo: "eu",
        selectable: false,
      },
    ],
    sizingMode: "snapshot",
    freeTier: "unverified (7-day trial, from a search digest)",
    status: "unverified",
    verifiedAt: READ_AT,
  },
  types: [
    {
      id: "individual",
      provider: "boxd",
      kind: "template",
      vcpu: 2,
      memoryMiB: 8192,
      diskGiB: 100,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "microvm",
      regions: ["eu"],
      limits: { maxConcurrent: 10 },
      notes: [
        "boxd.sh and docs.boxd.sh were unreachable; facts come from Omnara's boxd page and a search digest of boxd's docs (unverified).",
        "Individual plan: EUR 20/month for 2 vCPU/8 GiB per VM, 10 concurrent VMs, 100 GB CoW disk per VM. Size is that of the snapshot, else the org default; sizes up to 4 vCPU/16 GiB and 50 machines per org are unverified.",
        "Price is a monthly plan. The hourly rate is derived: 20 / 730 h = EUR 0.0274 per VM-hour, spread over 2 vCPUs as 0.0137 EUR per vCPU-hour. Memory is included in that figure, not billed separately. The `usd` field holds EUR (currency is EUR); no conversion to USD was made.",
        "Cold boot under 10 ms and resume under 1 ms are vendor claims. Egress controls, GPU, list-types API and per-second price are not documented.",
        "US regions are a waitlist ('coming').",
      ],
      price: {
        currency: "EUR",
        billing: "wall-clock",
        granularity: "s",
        rates: [
          rate(
            "vcpu",
            "per-vcpu-hour",
            20 / HOURS_PER_MONTH / 2,
            { value: 20, unit: "EUR per month per VM (2 vCPU/8 GiB)" },
            PRICING,
            true,
          ),
        ],
      },
      capabilities: {
        createFrom: ["snapshot"],
        snapshots: { fs: true, memory: false, fork: false },
        pause: { supported: true, keepsMemory: false },
        discovery: { types: false, regions: false, pricing: "docs" },
      },
    },
  ],
};
