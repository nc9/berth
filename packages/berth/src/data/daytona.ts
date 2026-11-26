import type { GpuType } from "../catalog/gpus.ts";
import type {
  Capabilities,
  ContainerType,
  PriceBook,
  Provider,
  Rate,
} from "../catalog/types.ts";

// Source: research/native.md (b), read 2026-11-26. Anything not documented
// there is left out. Booleans in `capabilities` that the research does not
// document are `false`, which means "not claimed", never "known absent".

const V = "2026-11-26";
const PRICING = "https://www.daytona.io/pricing";

const rate = (r: Omit<Rate, "verifiedAt" | "sourceUrl">): Rate => ({
  ...r,
  verifiedAt: V,
  sourceUrl: PRICING,
});

const cpuMem = (): Rate[] => [
  rate({
    dimension: "vcpu",
    unit: "per-vcpu-hour",
    usd: 0.0504,
    raw: { value: 0.0504, unit: "usd/vCPU-hour" },
  }),
  rate({
    dimension: "memory",
    unit: "per-gib-hour",
    usd: 0.0162,
    raw: { value: 0.0162, unit: "usd/GiB-hour" },
  }),
  rate({
    dimension: "disk",
    unit: "per-gib-hour",
    usd: 0.000108,
    raw: { value: 0.000108, unit: "usd/GiB-hour (first 5 GiB free)" },
  }),
];

const price = (rates: Rate[]): PriceBook => ({
  currency: "USD",
  billing: "wall-clock",
  granularity: "s",
  rates,
});

// Documented org maximum (docs page); defaults are 1 vCPU / 1 GiB / 3 GiB.
// The minimums are those defaults: no lower bound is documented.
const shared = {
  provider: "daytona",
  kind: "free-form",
  vcpu: { min: 1, max: 4 },
  memoryMiB: { min: 1024, max: 8192 },
  diskGiB: { min: 3, max: 10 },
  // Architecture is not documented.
  arch: [],
  regions: ["us", "eu"],
} satisfies Partial<ContainerType>;

/** Preemptible hourly GPU prices as printed. On-demand prices are not shown. */
const GPUS: [GpuType, number][] = [
  ["b300", 5.17],
  ["b200", 4.3],
  ["mi355x", 3.56],
  ["h200", 2.87],
  ["h100", 2.47],
  ["rtx-pro-6000", 1.95],
  ["l40s", 1.14],
  ["rtx-5090", 0.74],
  ["rtx-4090", 0.57],
];

// A GPU unit adds up to 16 vCPU, 192 GB RAM and 512 GB disk; up to 8 GPUs per
// sandbox. Types are per one GPU. "GB" is read as GiB (the unit is not stated).
const gpuTypes: ContainerType[] = GPUS.map(([type, usd]) => ({
  id: `gpu-${type}`,
  provider: "daytona",
  kind: "free-form",
  vcpu: { min: 1, max: 16 },
  memoryMiB: { min: 1024, max: 192 * 1024 },
  diskGiB: { min: 3, max: 512 },
  gpu: [{ type, count: 1, preemptible: true }],
  os: ["linux"],
  arch: [],
  isolation: "container",
  // GPU sandboxes run in the reserved `earth` region.
  regions: ["earth"],
  price: price([
    rate({
      dimension: "gpu",
      unit: "per-gpu-hour",
      usd,
      gpuType: type,
      raw: { value: usd, unit: "usd/GPU-hour (preemptible)" },
    }),
  ]),
}));

const vmCapabilities: Capabilities = {
  // Pause/resume is a VM-class capability. Whether pause keeps memory is not
  // documented.
  pause: { supported: true, keepsMemory: false },
};

export const daytona: Provider = {
  meta: {
    id: "daytona",
    name: "Daytona",
    website: "https://www.daytona.io",
    docs: "https://www.daytona.io/docs/en/sandboxes/",
    pricingUrl: PRICING,
    description:
      "Sandboxes in three classes (container, linux-vm, windows) with GPU, snapshots and the widest discovery API of the set. The product moved to a closed core. Container-class isolation technology is not named; windows isolation is recorded as the weakest class because it is not documented. macOS appears on the pricing page with an odd unit (unverified) and is not modelled. GPU prices are the preemptible rates; on-demand rates are not shown.",
    logo: { brandUrl: "https://www.daytona.io" },
    envVars: ["DAYTONA_API_KEY"],
    isolation: ["container", "linux-vm"],
    regions: [
      { id: "us", name: "US (shared)", geo: "us", selectable: true },
      { id: "eu", name: "EU (shared)", geo: "eu", selectable: true },
      {
        id: "earth",
        name: "Earth (reserved, GPU)",
        geo: "unverified",
        selectable: false,
      },
    ],
    sizingMode: "free-form",
    freeTier: "$200 free compute",
    status: "closed-core",
    verifiedAt: V,
    capabilities: {
      createFrom: ["snapshot"],
      snapshots: { fs: true, memory: true, fork: true },
      egress: {
        policies: ["open", "none", "allowlist"],
        domainMax: 100,
        cidrMax: 10,
        // At most one of block-all, CIDR list or domain list per create.
        mutuallyExclusive: true,
        // Runtime update is only for Tier 3/4 orgs, so it is not claimed.
      },
      labels: true,
      list: true,
      discovery: { types: true, regions: true, pricing: "docs" },
    },
  },
  types: [
    {
      ...shared,
      id: "container",
      os: ["linux"],
      isolation: "container",
      price: price(cpuMem()),
    },
    {
      ...shared,
      id: "linux-vm",
      os: ["linux"],
      isolation: "linux-vm",
      capabilities: vmCapabilities,
      price: price(cpuMem()),
    },
    {
      ...shared,
      id: "windows",
      os: ["windows"],
      isolation: "container",
      // Only the Windows vCPU rate is printed; memory and disk are not.
      price: price([
        rate({
          dimension: "vcpu",
          unit: "per-vcpu-hour",
          usd: 0.0858,
          raw: { value: 0.0858, unit: "usd/vCPU-hour" },
        }),
      ]),
    },
    ...gpuTypes,
  ],
};
