import type { GpuType } from "../catalog/gpus.ts";
import type {
  ContainerType,
  PriceBook,
  Provider,
  Rate,
} from "../catalog/types.ts";

// Source: research/native.md (b), read 2026-11-26. Booleans in `capabilities`
// that the research does not document are `false`: "not claimed".

const V = "2026-11-26";
const PRICING = "https://modal.com/pricing";
const HOUR = 3600;

/**
 * Modal documents no upper bound for CPU or memory. The range max is the
 * largest safe integer: "no documented limit", not a real capacity.
 */
const UNDOCUMENTED_MAX = Number.MAX_SAFE_INTEGER;

const rate = (r: Omit<Rate, "verifiedAt" | "sourceUrl">): Rate => ({
  ...r,
  verifiedAt: V,
  sourceUrl: PRICING,
});

// Modal prices per second. 1 Modal "core" (physical) = 2 vCPU.
const CORE_SECOND = 0.00003942;
const GIB_SECOND = 0.00000667;

const cpuMem = (): Rate[] => [
  rate({
    dimension: "vcpu",
    unit: "per-vcpu-hour",
    usd: (CORE_SECOND * HOUR) / 2,
    raw: {
      value: CORE_SECOND,
      unit: "usd/physical-core-second (1 core = 2 vCPU, so per vCPU-hour = value * 3600 / 2)",
    },
  }),
  rate({
    dimension: "memory",
    unit: "per-gib-hour",
    usd: GIB_SECOND * HOUR,
    raw: { value: GIB_SECOND, unit: "usd/GiB-second" },
  }),
];

const price = (rates: Rate[]): PriceBook => ({
  currency: "USD",
  billing: "wall-clock",
  granularity: "s",
  // 0.125 core = 0.25 vCPU.
  minimums: { vcpu: 0.25, memoryMiB: 128 },
  rates,
});

const regionIds = [
  "us",
  "eu",
  "ap",
  "us-east",
  "us-central",
  "us-south",
  "us-west",
  "eu-west",
  "eu-north",
  "eu-south",
  "ap-northeast",
  "ap-southeast",
  "ap-south",
  "ap-melbourne",
  "jp",
  "kr",
  "au",
  "uk",
  "ca",
  "me",
  "sa",
  "af",
  "mx",
];

const shared = {
  provider: "modal",
  kind: "free-form",
  // Docs: `cpu` is in physical cores (min 0.125 core = 0.25 vCPU).
  vcpu: { min: 0.25, max: UNDOCUMENTED_MAX },
  memoryMiB: { min: 128, max: UNDOCUMENTED_MAX },
  os: ["linux"],
  // Architecture is not documented.
  arch: [],
  regions: regionIds,
} satisfies Partial<ContainerType>;

/** Per GPU-second as printed. A100 without a size is not modelled. */
const GPUS: [GpuType, string, number][] = [
  ["t4", "T4", 0.000164],
  ["l4", "L4", 0.000222],
  ["a10", "A10", 0.000306],
  ["l40s", "L40S", 0.000542],
  ["a100-40gb", "A100-40GB", 0.000583],
  ["a100-80gb", "A100-80GB", 0.000694],
  ["rtx-pro-6000", "RTX-PRO-6000", 0.000842],
  ["h100", "H100", 0.001097],
  ["h200", "H200", 0.001261],
  ["b200", "B200", 0.001736],
  ["b300", "B300", 0.001972],
];

// Max 8 GPUs per container (A10: 4). Types are per one GPU. GPU sandboxes run
// on gVisor only. CPU and memory are billed on top of the GPU.
const gpuTypes: ContainerType[] = GPUS.map(([type, name, perSecond]) => ({
  ...shared,
  id: `gpu-${type}`,
  isolation: "gvisor",
  gpu: [{ type, count: 1 }],
  price: price([
    ...cpuMem(),
    rate({
      dimension: "gpu",
      unit: "per-gpu-hour",
      usd: perSecond * HOUR,
      gpuType: type,
      raw: { value: perSecond, unit: `usd/${name}-GPU-second` },
    }),
  ]),
}));

// Geography is taken from the id prefix; ids the docs do not expand are
// `unverified`.
const geoOf = (id: string): string => {
  const head = id.split("-")[0]!;
  return ["us", "eu", "ap"].includes(head)
    ? head
    : ["jp", "kr", "au", "uk", "ca", "mx"].includes(id)
      ? id
      : "unverified";
};
const regions = regionIds.map((id) => ({
  id,
  name: id,
  geo: geoOf(id),
  selectable: true,
  // The docs give a 1.15x (broad) and 1.75x (narrow) usage multiplier but the
  // research does not say which ids each applies to, so none is recorded.
}));

export const modal: Provider = {
  meta: {
    id: "modal",
    name: "Modal",
    website: "https://modal.com",
    docs: "https://modal.com/docs/guide/sandboxes",
    pricingUrl: PRICING,
    description:
      "Sandboxes on gVisor by default, or a VM runtime with its own kernel (no GPU). Free-form CPU and memory, many GPU types. A Modal core is 2 vCPU: rates are converted to per-vCPU-hour and the vendor value is kept in `raw`. Regional usage multipliers (1.15x broad, 1.75x narrow) are documented but not mapped to ids. The VM runtime has no separate documented price, so its type carries none. The upper bound of CPU and memory is not documented.",
    logo: { simpleIcons: "modal" },
    envVars: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET"],
    isolation: ["gvisor", "linux-vm"],
    regions,
    sizingMode: "free-form",
    freeTier:
      "Starter $0/month with $30/month credits; Team $250/month with $100 credits",
    status: "ga",
    verifiedAt: V,
    capabilities: {
      createFrom: ["image"],
      // Filesystem snapshots yes; memory snapshots are not covered by the docs.
      snapshots: { fs: true, memory: false, fork: false },
      // No pause or resume: sandboxes terminate.
      pause: { supported: false, keepsMemory: false },
      egress: {
        policies: ["open", "none", "allowlist"],
        // Domain allowlist is beta: TLS 443 by SNI only, `*.` wildcard.
        domainMatch: "sni",
        // Domain and CIDR lists are additive, and block-all is also a flag.
        mutuallyExclusive: false,
        // Runtime policy change is experimental, so it is not claimed.
      },
      maxLifetimeSec: 24 * HOUR,
      exec: { detached: true, streaming: true, tty: true },
      labels: true,
      list: true,
      ingress: true,
      discovery: { types: false, regions: false, pricing: "docs" },
    },
  },
  types: [
    {
      ...shared,
      id: "sandbox",
      isolation: "gvisor",
      limits: { maxLifetimeSec: 24 * HOUR },
      price: price(cpuMem()),
    },
    {
      ...shared,
      id: "sandbox-vm",
      isolation: "linux-vm",
      limits: { maxLifetimeSec: 24 * HOUR },
    },
    ...gpuTypes,
  ],
};
