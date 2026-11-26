import type { Arch, EgressPolicy, IsolationClass, Os } from "./primitives.ts";
import type { GpuType } from "./gpus.ts";

export const STATUS_VALUES = [
  "ga",
  "preview",
  "closed-core",
  "unverified",
] as const;
export type Status = (typeof STATUS_VALUES)[number];
export const SIZING_MODES = [
  "free-form",
  "presets",
  "template",
  "snapshot",
  "memory-only",
] as const;
export type SizingMode = (typeof SIZING_MODES)[number];
export const DOMAIN_MATCH_VALUES = ["sni", "dns", "sni+host"] as const;
export const PRICING_SOURCES = ["api", "docs"] as const;
export const TYPE_KINDS = ["preset", "template", "free-form"] as const;
export const CURRENCIES = ["USD", "EUR"] as const;

export interface Region {
  id: string;
  name: string;
  geo: string;
  selectable: boolean;
  priceMultiplier?: number;
}

/** Repo-relative paths of committed brand images, by kind and colour mode. */
export interface LogoFiles {
  icon?: LogoModes;
  logo?: LogoModes;
}
export interface LogoModes {
  light?: string;
  dark?: string;
  /** Image with its own opaque background; fits both themes. */
  opaque?: string;
}

export interface Logo {
  simpleIcons?: string;
  svg?: string;
  brandUrl?: string;
  files?: LogoFiles;
}

export interface Capabilities {
  createFrom?: string[];
  snapshots?: { fs: boolean; memory: boolean; fork: boolean };
  pause?: { supported: boolean; keepsMemory: boolean };
  egress?: {
    policies: EgressPolicy[];
    domainMatch?: (typeof DOMAIN_MATCH_VALUES)[number];
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
  discovery?: {
    types: boolean;
    regions: boolean;
    pricing: (typeof PRICING_SOURCES)[number];
  };
}

export const AUTH_KINDS = [
  "api_key",
  "token_pair",
  "oauth_client",
  "service_account_json",
  "iam_role",
  "iam_keys",
  "workload_identity",
  "other",
] as const;
export type AuthKind = (typeof AUTH_KINDS)[number];
export const AUTH_STATUS_VALUES = ["verified", "unverified"] as const;
export type AuthStatus = (typeof AUTH_STATUS_VALUES)[number];

/** One credential or config input of an auth method. Never holds a real value. */
export interface AuthField {
  /** Stable id within the method. */
  name: string;
  /** Conventional environment variable name. */
  env: string;
  secret: boolean;
  required: boolean;
  description: string;
  /** Non-secret fields only; never a real value. */
  example?: string;
  /** Non-secret fields only, e.g. an API URL. */
  default?: string;
}

/** One way a consumer authenticates to a provider. */
export interface AuthMethod {
  id: string;
  kind: AuthKind;
  label: string;
  /** Exactly one method per provider has `default: true`. */
  default?: boolean;
  docsUrl: string;
  verifiedAt: string;
  /** `unverified` when the docs did not confirm it; say why in `notes`. */
  status: AuthStatus;
  fields: AuthField[];
  notes?: string;
}

export interface ProviderMeta {
  id: string;
  name: string;
  website: string;
  docs: string;
  pricingUrl: string;
  description: string;
  logo: Logo;
  /** How a consumer authenticates. At least one method, exactly one default. */
  auth: AuthMethod[];
  /** Credential variable names only, never values. Derived from the default auth method's fields. */
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

export const BILLING_VALUES = [
  "wall-clock",
  "active-cpu",
  "memory-only",
  "active-cpu+provisioned-memory",
] as const;
export type Billing = (typeof BILLING_VALUES)[number];
export const GRANULARITIES = ["ms", "10ms", "s", "min"] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export const RATE_DIMENSIONS = [
  "vcpu",
  "memory",
  "disk",
  "gpu",
  "creation",
  "egress",
  "snapshot-storage",
] as const;
export type RateDimension = (typeof RATE_DIMENSIONS)[number];
export const RATE_UNITS = [
  "per-vcpu-hour",
  "per-gib-hour",
  "per-gb-month",
  "per-gpu-hour",
  "per-1M-creations",
  "per-gb",
] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

export interface Rate {
  dimension: RateDimension;
  unit: RateUnit;
  usd: number;
  /** The vendor's own value and unit, kept for auditing conversions. */
  raw?: { value: number; unit: string };
  /** Third-party or otherwise unconfirmed number. Treat as an estimate. */
  unverified?: boolean;
  gpuType?: GpuType;
  /** Multiplier per region id. Regions not listed use 1. */
  regionMultiplier?: Record<string, number>;
  verifiedAt: string;
  sourceUrl: string;
}

export interface PriceBook {
  currency: (typeof CURRENCIES)[number];
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
  kind: (typeof TYPE_KINDS)[number];
  /** The product line inside the provider, e.g. "fargate" or "lambda-microvms". */
  service?: string;
  /** Overrides the provider status for this type, e.g. a preview product. */
  status?: Status;
  /** Facts that do not fit a field, including what is unverified. */
  notes?: string[];
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
  /**
   * Rates are listed only where a source gives a number. A missing price (or a
   * missing dimension inside `rates`) means "not documented", never "free".
   */
  price?: PriceBook;
  /** Per-type override of the provider's capabilities. */
  capabilities?: Capabilities;
}

export interface Provider {
  meta: ProviderMeta;
  types: ContainerType[];
}
