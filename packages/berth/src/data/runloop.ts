import type { Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://docs.runloop.ai/docs/devboxes/lifecycle";

export const runloop: Provider = {
  meta: {
    id: "runloop",
    name: "Runloop",
    website: "https://runloop.ai",
    docs: "https://docs.runloop.ai/docs/devboxes/lifecycle",
    pricingUrl: PRICING,
    description: "Devboxes with suspend and resume.",
    logo: { brandUrl: "https://runloop.ai" },
    envVars: [],
    isolation: ["linux-vm"],
    regions: [],
    sizingMode: "free-form",
    freeTier: "unverified",
    // A third-party digest calls it "winding down"; no shutdown notice was found.
    status: "unverified",
    verifiedAt: READ_AT,
  },
  types: [
    {
      id: "devbox",
      provider: "runloop",
      kind: "free-form",
      vcpu: 1,
      memoryMiB: 1024,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "linux-vm",
      regions: [],
      notes: [
        "Provider status is unverified: a third-party digest calls Runloop 'winding down' and no shutdown notice was found, only 2026 incidents. Confirm before relying on it.",
        "Sizes, regions, egress, architecture and max lifetime are not documented on the page read: 1 vCPU/1 GiB is a placeholder. Isolation class is unverified.",
        "Suspend keeps disk only (no memory); the original ID persists. Compute is billed only while initializing, running, suspending or resuming.",
        "Rates ($0.108/CPU-h, $0.0252/GB-h) come from a third-party digest only (unverified). GB is treated as GiB.",
      ],
      price: {
        currency: "USD",
        billing: "wall-clock",
        granularity: "s",
        rates: [
          rate(
            "vcpu",
            "per-vcpu-hour",
            0.108,
            { value: 0.108, unit: "USD per CPU-hour" },
            PRICING,
            true,
          ),
          rate(
            "memory",
            "per-gib-hour",
            0.0252,
            { value: 0.0252, unit: "USD per GB-hour" },
            PRICING,
            true,
          ),
        ],
      },
      capabilities: {
        createFrom: ["image"],
        snapshots: { fs: true, memory: false, fork: false },
        pause: { supported: true, keepsMemory: false },
        discovery: { types: false, regions: false, pricing: "docs" },
      },
    },
  ],
};
