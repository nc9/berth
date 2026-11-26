import { GPU_TYPES } from "./gpus.ts";
import {
  ARCH_VALUES,
  EGRESS_POLICIES,
  ISOLATION_CLASSES,
  OS_VALUES,
} from "./primitives.ts";
import {
  AUTH_KINDS,
  AUTH_STATUS_VALUES,
  BILLING_VALUES,
  CURRENCIES,
  DOMAIN_MATCH_VALUES,
  GRANULARITIES,
  PRICING_SOURCES,
  RATE_DIMENSIONS,
  RATE_UNITS,
  SIZING_MODES,
  STATUS_VALUES,
  TYPE_KINDS,
} from "./types.ts";
import type {
  AuthField,
  AuthMethod,
  Capabilities,
  ContainerType,
  GpuSpec,
  Logo,
  LogoFiles,
  LogoModes,
  PriceBook,
  Provider,
  ProviderMeta,
  Rate,
  Region,
} from "./types.ts";

/** Version of the served catalog document. Bump on breaking shape changes. */
export const SCHEMA_VERSION = 1;

type Json = Record<string, unknown>;

// Single source of truth: every object schema below is declared through
// `shape<T>()`, whose parameter is derived from the TypeScript type `T`. A
// field added to, removed from, or made optional/required in `types.ts` stops
// this file from compiling until the schema is updated. Enum values come from
// the same const arrays that define the TS unions.
type Field<R extends boolean> = { schema: Json; required: R };
type Shape<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? Field<false> : Field<true>;
};
const req = (schema: Json): Field<true> => ({ schema, required: true });
const opt = (schema: Json): Field<false> => ({ schema, required: false });

function shape<T>(fields: Shape<T>): Json {
  const entries = Object.entries(fields) as [string, Field<boolean>][];
  return {
    type: "object",
    properties: Object.fromEntries(entries.map(([k, f]) => [k, f.schema])),
    required: entries.filter(([, f]) => f.required).map(([k]) => k),
    additionalProperties: false,
  };
}

const str: Json = { type: "string" };
const bool: Json = { type: "boolean" };
const num: Json = { type: "number" };
const posNum: Json = { type: "number", exclusiveMinimum: 0 };
const posInt: Json = { type: "integer", minimum: 1 };
const https: Json = { type: "string", pattern: "^https://" };
const date: Json = {
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}(T[0-9:.]+(Z|[+-]\\d{2}:\\d{2}))?$",
};
const kebab: Json = { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" };
const list = (items: Json): Json => ({ type: "array", items });
const en = (values: readonly string[]): Json => ({
  type: "string",
  enum: [...values],
});
const ref = (name: string): Json => ({ $ref: `#/$defs/${name}` });
const numberOrRange = (item: Json): Json => ({
  anyOf: [
    item,
    shape<{ min: number; max: number }>({ min: req(item), max: req(item) }),
  ],
});

type NonNull<T, K extends keyof T> = NonNullable<T[K]>;

const capabilities = shape<Capabilities>({
  createFrom: opt(list(str)),
  snapshots: opt(
    shape<NonNull<Capabilities, "snapshots">>({
      fs: req(bool),
      memory: req(bool),
      fork: req(bool),
    }),
  ),
  pause: opt(
    shape<NonNull<Capabilities, "pause">>({
      supported: req(bool),
      keepsMemory: req(bool),
    }),
  ),
  egress: opt(
    shape<NonNull<Capabilities, "egress">>({
      policies: req(list(en(EGRESS_POLICIES))),
      domainMatch: opt(en(DOMAIN_MATCH_VALUES)),
      domainMax: opt(num),
      cidrMax: opt(num),
      mutuallyExclusive: opt(bool),
      runtimeUpdate: opt(bool),
    }),
  ),
  maxLifetimeSec: opt(num),
  minBillingSec: opt(num),
  exec: opt(
    shape<NonNull<Capabilities, "exec">>({
      detached: req(bool),
      streaming: req(bool),
      tty: req(bool),
    }),
  ),
  files: opt(
    shape<NonNull<Capabilities, "files">>({
      upload: req(bool),
      download: req(bool),
      maxBytes: opt(num),
    }),
  ),
  labels: opt(bool),
  list: opt(bool),
  ingress: opt(bool),
  discovery: opt(
    shape<NonNull<Capabilities, "discovery">>({
      types: req(bool),
      regions: req(bool),
      pricing: req(en(PRICING_SOURCES)),
    }),
  ),
});

const region = shape<Region>({
  id: req(kebab),
  name: req(str),
  geo: req(str),
  selectable: req(bool),
  priceMultiplier: opt(posNum),
});

const logoPath: Json = {
  type: "string",
  pattern:
    "^packages/berth/assets/logos/[a-z0-9-]+/(icon|logo)-(light|dark|opaque)\\.(svg|png)$",
};
const logoModes = shape<LogoModes>({
  light: opt(logoPath),
  dark: opt(logoPath),
  opaque: opt(logoPath),
});

const authField = shape<AuthField>({
  name: req(str),
  env: req(str),
  secret: req(bool),
  required: req(bool),
  description: req(str),
  example: opt(str),
  default: opt(str),
});

const authMethod = shape<AuthMethod>({
  id: req(kebab),
  kind: req(en(AUTH_KINDS)),
  label: req(str),
  default: opt(bool),
  docsUrl: req(https),
  verifiedAt: req(date),
  status: req(en(AUTH_STATUS_VALUES)),
  fields: req(list(authField)),
  notes: opt(str),
});

const providerMeta = shape<ProviderMeta>({
  id: req(kebab),
  name: req(str),
  website: req(https),
  docs: req(https),
  pricingUrl: req(https),
  description: req(str),
  logo: req(
    shape<Logo>({
      simpleIcons: opt(str),
      svg: opt(str),
      brandUrl: opt(https),
      files: opt(
        shape<LogoFiles>({
          icon: opt(logoModes),
          logo: opt(logoModes),
        }),
      ),
    }),
  ),
  auth: req({ type: "array", minItems: 1, items: authMethod }),
  envVars: req(list(str)),
  isolation: req(list(en(ISOLATION_CLASSES))),
  regions: req(list(region)),
  sizingMode: req(en(SIZING_MODES)),
  freeTier: req(str),
  status: req(en(STATUS_VALUES)),
  verifiedAt: req(date),
  capabilities: opt(ref("Capabilities")),
});

const rate = shape<Rate>({
  dimension: req(en(RATE_DIMENSIONS)),
  unit: req(en(RATE_UNITS)),
  usd: req({ type: "number", minimum: 0 }),
  raw: opt(shape<NonNull<Rate, "raw">>({ value: req(num), unit: req(str) })),
  unverified: opt(bool),
  gpuType: opt(en(GPU_TYPES)),
  regionMultiplier: opt({ type: "object", additionalProperties: posNum }),
  verifiedAt: req(date),
  sourceUrl: req(https),
});

const priceBook = shape<PriceBook>({
  currency: req(en(CURRENCIES)),
  billing: req(en(BILLING_VALUES)),
  granularity: req(en(GRANULARITIES)),
  minimums: opt(
    shape<NonNull<PriceBook, "minimums">>({
      vcpu: opt(num),
      memoryMiB: opt(posInt),
      billedMinutes: opt(num),
    }),
  ),
  rates: req(list(ref("Rate"))),
  monthlyFeeUsd: opt(num),
  includedCreditUsd: opt(num),
});

const containerType = shape<ContainerType>({
  id: req(kebab),
  provider: req(kebab),
  kind: req(en(TYPE_KINDS)),
  service: opt(str),
  status: opt(en(STATUS_VALUES)),
  notes: opt(list(str)),
  vcpu: req(numberOrRange(posNum)),
  memoryMiB: req(numberOrRange(posInt)),
  diskGiB: opt(numberOrRange(posNum)),
  gpu: opt(
    list(
      shape<GpuSpec>({
        type: req(en(GPU_TYPES)),
        count: req(posInt),
        vramGiB: opt(posNum),
        preemptible: opt(bool),
      }),
    ),
  ),
  os: req(list(en(OS_VALUES))),
  arch: req(list(en(ARCH_VALUES))),
  isolation: req(en(ISOLATION_CLASSES)),
  regions: req(list(str)),
  limits: opt(
    shape<NonNull<ContainerType, "limits">>({
      maxLifetimeSec: opt(num),
      maxConcurrent: opt(num),
      planGate: opt(str),
    }),
  ),
  price: opt(ref("PriceBook")),
  capabilities: opt(ref("Capabilities")),
});

/** JSON Schema (draft 2020-12) for one provider record. */
export const providerSchema: Json = shape<Provider>({
  meta: req(ref("ProviderMeta")),
  types: req(list(ref("ContainerType"))),
});

const defs: Record<string, Json> = {
  Capabilities: capabilities,
  ProviderMeta: providerMeta,
  Rate: rate,
  PriceBook: priceBook,
  ContainerType: containerType,
};

/** JSON Schema (draft 2020-12) for the served `catalog.json` document. */
export const catalogSchema: Json = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "berth catalog",
  ...shape<{
    schemaVersion: number;
    generatedAt: string;
    providers: Provider[];
  }>({
    schemaVersion: req({ const: SCHEMA_VERSION }),
    generatedAt: req({ type: "string", format: "date-time" }),
    providers: req(list(ref("Provider"))),
  }),
  $defs: { Provider: providerSchema, ...defs },
};
