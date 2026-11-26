import type { Arch, EgressPolicy, IsolationClass, Os } from "./primitives.ts";
import type { GpuType } from "./gpus.ts";

export type Status = "ga" | "preview" | "closed-core" | "unverified";
export type SizingMode =
  "free-form" | "presets" | "template" | "snapshot" | "memory-only";

export interface Region {
  id: string;
  name: string;
  geo: string;
  selectable: boolean;
  priceMultiplier?: number;
}

export interface Logo {
  simpleIcons?: string;
  svg?: string;
  brandUrl?: string;
}

export interface Capabilities {
  createFrom?: string[];
  snapshots?: { fs: boolean; memory: boolean; fork: boolean };
  pause?: { supported: boolean; keepsMemory: boolean };
  egress?: {
    policies: EgressPolicy[];
    domainMatch?: "sni" | "dns" | "sni+host";
    domainMax?: number;
    cidrMax?: number;
    mutuallyExclusive?: boolean;
    runtimeUpdate?: boolean;
  };
  maxLifetimeSec?: number;
  minBillingSec?: number;
  exec?: { detached: boolean; streaming: boolean; tty: boolean };
  files?: { upload: boolean; download: boolean; maxBytes?: number };
  labels?: boolean;
  list?: boolean;
  ingress?: boolean;
  discovery?: { types: boolean; regions: boolean; pricing: "api" | "docs" };
}

export interface ProviderMeta {
  id: string;
  name: string;
  website: string;
  docs: string;
  pricingUrl: string;
  description: string;
  logo: Logo;
  /** Credential variable names only, never values. */
  envVars: string[];
  isolation: IsolationClass[];
  regions: Region[];
  sizingMode: SizingMode;
  /** Free-form description of the free tier, or `unverified`. */
  freeTier: string;
  status: Status;
  verifiedAt: string;
  capabilities?: Capabilities;
}

/** A fixed number or an inclusive range. */
export type NumberOrRange = number | { min: number; max: number };

export interface GpuSpec {
  type: GpuType;
  count: number;
  vramGiB?: number;
  preemptible?: boolean;
}

export type Billing =
  "wall-clock" | "active-cpu" | "memory-only" | "active-cpu+provisioned-memory";
export type Granularity = "ms" | "10ms" | "s" | "min";
export type RateDimension =
  | "vcpu"
  | "memory"
  | "disk"
  | "gpu"
  | "creation"
  | "egress"
  | "snapshot-storage";
export type RateUnit =
  | "per-vcpu-hour"
  | "per-gib-hour"
  | "per-gb-month"
  | "per-gpu-hour"
  | "per-1M-creations"
  | "per-gb";

export interface Rate {
  dimension: RateDimension;
  unit: RateUnit;
  usd: number;
  /** The vendor's own value and unit, kept for auditing conversions. */
  raw?: { value: number; unit: string };
  gpuType?: GpuType;
  /** Multiplier per region id. Regions not listed use 1. */
  regionMultiplier?: Record<string, number>;
  verifiedAt: string;
  sourceUrl: string;
}

export interface PriceBook {
  currency: "USD" | "EUR";
  billing: Billing;
  granularity: Granularity;
  minimums?: { vcpu?: number; memoryMiB?: number; billedMinutes?: number };
  rates: Rate[];
  monthlyFeeUsd?: number;
  includedCreditUsd?: number;
}

export interface ContainerType {
  id: string;
  provider: string;
  kind: "preset" | "template" | "free-form";
  vcpu: NumberOrRange;
  /** MiB everywhere. */
  memoryMiB: NumberOrRange;
  diskGiB?: NumberOrRange;
  gpu?: GpuSpec[];
  os: Os[];
  arch: Arch[];
  isolation: IsolationClass;
  regions: string[];
  limits?: {
    maxLifetimeSec?: number;
    maxConcurrent?: number;
    planGate?: string;
  };
  price?: PriceBook;
  /** Per-type override of the provider's capabilities. */
  capabilities?: Capabilities;
}

export interface Provider {
  meta: ProviderMeta;
  types: ContainerType[];
}
