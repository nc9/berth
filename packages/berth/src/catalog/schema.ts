import { GPU_TYPES } from "./gpus.ts";
import {
  ARCH_VALUES,
  EGRESS_POLICIES,
  ISOLATION_CLASSES,
  OS_VALUES,
} from "./primitives.ts";

/** Version of the served catalog document. Bump on breaking shape changes. */
export const SCHEMA_VERSION = 1;

type Json = Record<string, unknown>;

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
const obj = (
  properties: Record<string, Json>,
  required: string[] = [],
): Json => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const numberOrRange = (item: Json): Json => ({
  anyOf: [item, obj({ min: item, max: item }, ["min", "max"])],
});

const capabilities = obj({
  createFrom: list(str),
  snapshots: obj({ fs: bool, memory: bool, fork: bool }, [
    "fs",
    "memory",
    "fork",
  ]),
  pause: obj({ supported: bool, keepsMemory: bool }, [
    "supported",
    "keepsMemory",
  ]),
  egress: obj(
    {
      policies: list(en(EGRESS_POLICIES)),
      domainMatch: en(["sni", "dns", "sni+host"]),
      domainMax: num,
      cidrMax: num,
      mutuallyExclusive: bool,
      runtimeUpdate: bool,
    },
    ["policies"],
  ),
  maxLifetimeSec: num,
  minBillingSec: num,
  exec: obj({ detached: bool, streaming: bool, tty: bool }, [
    "detached",
    "streaming",
    "tty",
  ]),
  files: obj({ upload: bool, download: bool, maxBytes: num }, [
    "upload",
    "download",
  ]),
  labels: bool,
  list: bool,
  ingress: bool,
  discovery: obj(
    {
      types: bool,
      regions: bool,
      pricing: en(["api", "docs"]),
    },
    ["types", "regions", "pricing"],
  ),
});

/** JSON Schema (draft 2020-12) for one provider record. */
export const providerSchema: Json = obj(
  {
    meta: ref("ProviderMeta"),
    types: list(ref("ContainerType")),
  },
  ["meta", "types"],
);

const defs: Record<string, Json> = {
  Capabilities: capabilities,
  ProviderMeta: obj(
    {
      id: kebab,
      name: str,
      website: https,
      docs: https,
      pricingUrl: https,
      description: str,
      logo: obj({ simpleIcons: str, svg: str, brandUrl: https }),
      envVars: list(str),
      isolation: list(en(ISOLATION_CLASSES)),
      regions: list(
        obj(
          {
            id: kebab,
            name: str,
            geo: str,
            selectable: bool,
            priceMultiplier: posNum,
          },
          ["id", "name", "geo", "selectable"],
        ),
      ),
      sizingMode: en([
        "free-form",
        "presets",
        "template",
        "snapshot",
        "memory-only",
      ]),
      freeTier: str,
      status: en(["ga", "preview", "closed-core", "unverified"]),
      verifiedAt: date,
      capabilities: ref("Capabilities"),
    },
    [
      "id",
      "name",
      "website",
      "docs",
      "pricingUrl",
      "description",
      "logo",
      "envVars",
      "isolation",
      "regions",
      "sizingMode",
      "freeTier",
      "status",
      "verifiedAt",
    ],
  ),
  Rate: obj(
    {
      dimension: en([
        "vcpu",
        "memory",
        "disk",
        "gpu",
        "creation",
        "egress",
        "snapshot-storage",
      ]),
      unit: en([
        "per-vcpu-hour",
        "per-gib-hour",
        "per-gb-month",
        "per-gpu-hour",
        "per-1M-creations",
        "per-gb",
      ]),
      usd: { type: "number", minimum: 0 },
      raw: obj({ value: num, unit: str }, ["value", "unit"]),
      gpuType: en(GPU_TYPES),
      regionMultiplier: {
        type: "object",
        additionalProperties: posNum,
      },
      verifiedAt: date,
      sourceUrl: https,
    },
    ["dimension", "unit", "usd", "verifiedAt", "sourceUrl"],
  ),
  PriceBook: obj(
    {
      currency: en(["USD", "EUR"]),
      billing: en([
        "wall-clock",
        "active-cpu",
        "memory-only",
        "active-cpu+provisioned-memory",
      ]),
      granularity: en(["ms", "10ms", "s", "min"]),
      minimums: obj({ vcpu: num, memoryMiB: posInt, billedMinutes: num }),
      rates: list(ref("Rate")),
      monthlyFeeUsd: num,
      includedCreditUsd: num,
    },
    ["currency", "billing", "granularity", "rates"],
  ),
  ContainerType: obj(
    {
      id: kebab,
      provider: kebab,
      kind: en(["preset", "template", "free-form"]),
      vcpu: numberOrRange(posNum),
      memoryMiB: numberOrRange(posInt),
      diskGiB: numberOrRange(posNum),
      gpu: list(
        obj(
          {
            type: en(GPU_TYPES),
            count: posInt,
            vramGiB: posNum,
            preemptible: bool,
          },
          ["type", "count"],
        ),
      ),
      os: list(en(OS_VALUES)),
      arch: list(en(ARCH_VALUES)),
      isolation: en(ISOLATION_CLASSES),
      regions: list(str),
      limits: obj({
        maxLifetimeSec: num,
        maxConcurrent: num,
        planGate: str,
      }),
      price: ref("PriceBook"),
      capabilities: ref("Capabilities"),
    },
    [
      "id",
      "provider",
      "kind",
      "vcpu",
      "memoryMiB",
      "os",
      "arch",
      "isolation",
      "regions",
    ],
  ),
};

/** JSON Schema (draft 2020-12) for the served `catalog.json` document. */
export const catalogSchema: Json = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "berth catalog",
  ...obj(
    {
      schemaVersion: { const: SCHEMA_VERSION },
      generatedAt: { type: "string", format: "date-time" },
      providers: list(ref("Provider")),
    },
    ["schemaVersion", "generatedAt", "providers"],
  ),
  $defs: { Provider: providerSchema, ...defs },
};
