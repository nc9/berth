import type { Provider } from "../src/index.ts";

const V = "2026-11-26";
const S = "https://example.com/pricing";

export function fixture(): Provider {
  return {
    meta: {
      id: "acme",
      name: "Acme",
      website: "https://example.com",
      docs: "https://example.com/docs",
      pricingUrl: S,
      description: "Fixture provider",
      logo: { brandUrl: "https://example.com/logo.svg" },
      envVars: ["ACME_API_KEY"],
      isolation: ["container", "microvm"],
      regions: [
        { id: "us-east", name: "US East", geo: "us", selectable: true },
        {
          id: "eu-west",
          name: "EU West",
          geo: "eu",
          selectable: true,
          priceMultiplier: 1.2,
        },
      ],
      sizingMode: "free-form",
      freeTier: "unverified",
      status: "ga",
      verifiedAt: V,
      capabilities: { egress: { policies: ["open", "none"] } },
    },
    types: [
      {
        id: "small",
        provider: "acme",
        kind: "free-form",
        vcpu: { min: 1, max: 4 },
        memoryMiB: { min: 1024, max: 8192 },
        os: ["linux"],
        arch: ["x86_64"],
        isolation: "container",
        regions: ["us-east", "eu-west"],
        price: {
          currency: "USD",
          billing: "wall-clock",
          granularity: "s",
          minimums: { billedMinutes: 1 },
          rates: [
            {
              dimension: "vcpu",
              unit: "per-vcpu-hour",
              usd: 0.036,
              raw: { value: 0.00001, unit: "usd/vcpu-second" },
              regionMultiplier: { "eu-west": 1.5 },
              verifiedAt: V,
              sourceUrl: S,
            },
            {
              dimension: "memory",
              unit: "per-gib-hour",
              usd: 0.0072,
              verifiedAt: V,
              sourceUrl: S,
            },
          ],
        },
      },
      {
        id: "gpu",
        provider: "acme",
        kind: "preset",
        vcpu: 8,
        memoryMiB: 32768,
        gpu: [{ type: "h100", count: 2 }],
        os: ["linux"],
        arch: ["x86_64", "arm64"],
        isolation: "microvm",
        regions: ["us-east"],
        capabilities: { egress: { policies: ["allowlist"] } },
        price: {
          currency: "USD",
          billing: "active-cpu",
          granularity: "min",
          rates: [
            {
              dimension: "vcpu",
              unit: "per-vcpu-hour",
              usd: 0.1,
              verifiedAt: V,
              sourceUrl: S,
            },
            {
              dimension: "gpu",
              unit: "per-gpu-hour",
              usd: 3,
              gpuType: "h100",
              verifiedAt: "2026-11-01",
              sourceUrl: S,
            },
          ],
        },
      },
    ],
  };
}
