import type { Provider } from "../catalog/types.ts";
import { READ_AT, rate } from "./helpers.ts";

const PRICING = "https://northflank.com/pricing";

export const northflank: Provider = {
  meta: {
    id: "northflank",
    name: "Northflank",
    website: "https://northflank.com",
    docs: "https://northflank.com/docs",
    pricingUrl: PRICING,
    description:
      "Plans from 0.5 vCPU/1 GB to 8 vCPU/16 GB on Kata and Cloud Hypervisor.",
    logo: { brandUrl: "https://northflank.com" },
    envVars: [],
    isolation: ["microvm"],
    regions: [],
    sizingMode: "presets",
    freeTier: "Sandbox plan free up to $20/month",
    status: "ga",
    verifiedAt: READ_AT,
  },
  types: [
    {
      id: "plan",
      provider: "northflank",
      kind: "free-form",
      vcpu: { min: 0.5, max: 8 },
      memoryMiB: { min: 1024, max: 16384 },
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "microvm",
      regions: [],
      notes: [
        "Plans run from 0.5 vCPU/1 GB to 8 vCPU/16 GB; the plan list between the ends was not read, so this is a range. GB is treated as GiB.",
        "17 regions and Kata + Cloud Hypervisor isolation come from a third-party digest (unverified); region ids are not listed.",
        "Egress policies are BYOC-only (third-party digest, unverified).",
        "Not modelled: disk $0.11657/GiB-month, egress $0.06/GB, and GPUs per hour (L4 $0.80, A100-40 $1.42, A100-80 $1.76, H100 $2.74 in 8 only, RTX PRO 6000 $3.00, H200 $3.14, B200 $5.87).",
      ],
      price: {
        currency: "USD",
        billing: "wall-clock",
        granularity: "s",
        includedCreditUsd: 20,
        rates: [
          rate(
            "vcpu",
            "per-vcpu-hour",
            0.01667,
            { value: 0.01667, unit: "USD per vCPU-hour" },
            PRICING,
          ),
          rate(
            "memory",
            "per-gib-hour",
            0.00833,
            { value: 0.00833, unit: "USD per GB-hour" },
            PRICING,
          ),
        ],
      },
      capabilities: {
        createFrom: ["image"],
        discovery: { types: false, regions: false, pricing: "docs" },
      },
    },
  ],
};
