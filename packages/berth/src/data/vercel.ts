import { envVarsFromAuth } from "../catalog/auth.ts";
import { AUTH } from "./auth.ts";
import type { Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://vercel.com/docs/sandbox/pricing";

export const vercel: Provider = {
  meta: {
    id: "vercel",
    name: "Vercel Sandbox",
    website: "https://vercel.com",
    docs: "https://vercel.com/docs/sandbox",
    pricingUrl: PRICING,
    description:
      "Ephemeral compute sandboxes billed on active CPU and provisioned memory.",
    logo: { simpleIcons: "vercel" },
    auth: AUTH.vercel,
    envVars: envVarsFromAuth(AUTH.vercel),
    isolation: ["microvm"],
    regions: [
      {
        id: "iad1",
        name: "Washington, D.C. (default)",
        geo: "us",
        selectable: true,
      },
    ],
    sizingMode: "free-form",
    freeTier: "unverified (Hobby plan exists; allowance not read)",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    {
      id: "sandbox",
      provider: "vercel",
      kind: "free-form",
      vcpu: { min: 1, max: 32 },
      memoryMiB: { min: 2048, max: 65536 },
      diskGiB: 64,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "microvm",
      regions: ["iad1"],
      limits: {
        maxLifetimeSec: 24 * 3600,
        maxConcurrent: 10000,
        planGate:
          "Hobby: 10 concurrent, 45 min session. Pro: 10,000 concurrent, 24 h, max 8 vCPU/16 GB. Enterprise: 32 vCPU/64 GB.",
      },
      notes: [
        "vCPUs are 1 or even 2-32; each vCPU includes 2 GB, so memory is tied to vcpu (not independent). 64 GB NVMe. Default timeout 5 min. Limits shown are the highest plan; see planGate.",
        "Only iad1 is listed: the docs say 19 regions and prices differ by region, but the list and multipliers were not read from the selector.",
        "Rates are iad1: Active CPU $0.128/h and provisioned memory $0.0212/GB-h (GB treated as GiB). Active-CPU billing needs usage.cpuSeconds. Creations $0.60 per 1M, snapshot storage $0.08/GB-month, drives $0.05/GB-month.",
        "Firecracker microVM and domain/CIDR allowlists come from a third-party digest only (unverified).",
        "Persistent sandboxes via snapshots, 30-day default expiry.",
      ],
      price: {
        currency: "USD",
        billing: "active-cpu+provisioned-memory",
        granularity: "s",
        rates: [
          rate(
            "vcpu",
            "per-vcpu-hour",
            0.128,
            { value: 0.128, unit: "USD per active vCPU-hour" },
            PRICING,
          ),
          rate(
            "memory",
            "per-gib-hour",
            0.0212,
            { value: 0.0212, unit: "USD per GB-hour" },
            PRICING,
          ),
          rate(
            "creation",
            "per-1M-creations",
            0.6,
            { value: 0.6, unit: "USD per 1M creations" },
            PRICING,
          ),
          rate(
            "snapshot-storage",
            "per-gb-month",
            0.08,
            { value: 0.08, unit: "USD per GB-month" },
            PRICING,
          ),
          rate(
            "disk",
            "per-gb-month",
            0.05,
            { value: 0.05, unit: "USD per GB-month (drives)" },
            PRICING,
          ),
        ],
      },
      capabilities: {
        createFrom: ["image", "snapshot"],
        snapshots: { fs: true, memory: false, fork: false },
        discovery: { types: false, regions: true, pricing: "docs" },
      },
    },
  ],
};
