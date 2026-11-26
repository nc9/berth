import { envVarsFromAuth } from "../catalog/auth.ts";
import { AUTH } from "./auth.ts";
import type { Provider, Rate } from "../catalog/types.ts";

// Source: research/native.md (b), read 2026-11-26. Booleans in `capabilities`
// that the research does not document are `false`: "not claimed".

const V = "2026-11-26";
const PRICING = "https://e2b.dev/pricing";
const HOUR = 3600;

const rate = (r: Omit<Rate, "verifiedAt" | "sourceUrl">): Rate => ({
  ...r,
  verifiedAt: V,
  sourceUrl: PRICING,
});

export const e2b: Provider = {
  meta: {
    id: "e2b",
    name: "E2B",
    website: "https://e2b.dev",
    docs: "https://docs.e2b.dev",
    pricingUrl: PRICING,
    description:
      "Template-based sandboxes: CPU and memory are fixed per template at build time. Isolation is recorded as microvm (Firecracker) from a third-party source (Upstash); E2B's own template page does not name it, so treat it as unverified first-party. Regions are third-party too and not selectable per the docs read. Egress: `allowOut` takes IPs, CIDRs and domains (`*.` wildcards; HTTP:80 Host and TLS:443 SNI only); `denyOut` takes IPs and CIDRs only, never domains; allow beats deny. Disk is free. No GPU.",
    logo: { brandUrl: "https://e2b.dev" },
    auth: AUTH.e2b,
    envVars: envVarsFromAuth(AUTH.e2b),
    isolation: ["microvm"],
    regions: [
      {
        id: "gcp-us-west1",
        name: "GCP us-west1",
        geo: "us",
        selectable: false,
      },
      {
        id: "aws-us-west-2",
        name: "AWS us-west-2",
        geo: "us",
        selectable: false,
      },
      {
        id: "aws-us-east-1",
        name: "AWS us-east-1",
        geo: "us",
        selectable: false,
      },
    ],
    sizingMode: "template",
    freeTier: "Hobby $0 with a $100 one-time credit; Pro $150/month",
    status: "ga",
    verifiedAt: V,
    capabilities: {
      createFrom: ["template"],
      // Persistent snapshots exist; what they hold is not documented.
      snapshots: { fs: true, memory: false, fork: false },
      // Pause keeps memory and filesystem by default (`mode: "filesystem"`
      // drops memory); paused sandboxes are kept indefinitely.
      pause: { supported: true, keepsMemory: true },
      egress: {
        policies: ["open", "none", "allowlist"],
        domainMatch: "sni+host",
        runtimeUpdate: true,
      },
      // 24 h on Pro, 1 h on Hobby.
      maxLifetimeSec: 24 * HOUR,
      discovery: { types: true, regions: false, pricing: "docs" },
    },
  },
  types: [
    {
      id: "template",
      provider: "e2b",
      kind: "template",
      // Plan limits: 1-8 vCPU, 1-8 GiB (default 2 vCPU / 4 GiB).
      vcpu: { min: 1, max: 8 },
      memoryMiB: { min: 1024, max: 8192 },
      // 10 GiB Hobby, 20 GiB Pro.
      diskGiB: { min: 10, max: 20 },
      os: ["linux"],
      // Architecture is not documented.
      arch: [],
      isolation: "microvm",
      regions: ["gcp-us-west1", "aws-us-west-2", "aws-us-east-1"],
      limits: { maxLifetimeSec: 24 * HOUR, planGate: "Pro (Hobby: 1 h)" },
      price: {
        currency: "USD",
        billing: "wall-clock",
        granularity: "s",
        rates: [
          rate({
            dimension: "vcpu",
            unit: "per-vcpu-hour",
            usd: 0.000014 * HOUR,
            raw: { value: 0.000014, unit: "usd/vCPU-second" },
          }),
          rate({
            dimension: "memory",
            unit: "per-gib-hour",
            usd: 0.0000045 * HOUR,
            raw: { value: 0.0000045, unit: "usd/GiB-second" },
          }),
        ],
      },
    },
  ],
};
