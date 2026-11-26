import { AUTH_KINDS, AUTH_STATUS_VALUES } from "./types.ts";
import { GPU_TYPES } from "./gpus.ts";
import { ISOLATION_CLASSES, ARCH_VALUES, OS_VALUES } from "./primitives.ts";
import type {
  ContainerType,
  NumberOrRange,
  PriceBook,
  Provider,
  ProviderMeta,
} from "./types.ts";

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const isKebab = (s: unknown): boolean => typeof s === "string" && KEBAB.test(s);
const isHttps = (s: unknown): boolean => {
  if (typeof s !== "string") return false;
  try {
    return new URL(s).protocol === "https:";
  } catch {
    return false;
  }
};
const isIso = (s: unknown): boolean =>
  typeof s === "string" && ISO.test(s) && !Number.isNaN(Date.parse(s));

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
}

function checkNumber(
  label: string,
  v: NumberOrRange,
  errs: string[],
  integer: boolean,
) {
  const bad = (n: unknown) =>
    typeof n !== "number" ||
    !Number.isFinite(n) ||
    n <= 0 ||
    (integer && !Number.isInteger(n));
  const what = integer ? "a positive integer" : "a positive number";
  if (typeof v === "number") {
    if (bad(v)) errs.push(`${label} must be ${what}, got ${v}`);
  } else if (v && typeof v === "object") {
    if (bad(v.min) || bad(v.max))
      errs.push(`${label} range bounds must be ${what}`);
    else if (v.min > v.max)
      errs.push(`${label} range min ${v.min} is greater than max ${v.max}`);
  } else errs.push(`${label} must be a number or {min, max}`);
}

const RATE_UNITS: Record<string, readonly string[]> = {
  vcpu: ["per-vcpu-hour"],
  memory: ["per-gib-hour"],
  gpu: ["per-gpu-hour"],
  disk: ["per-gib-hour", "per-gb-month"],
  creation: ["per-1M-creations"],
  egress: ["per-gb"],
  "snapshot-storage": ["per-gb-month"],
};

function validatePrice(label: string, p: PriceBook, errs: string[]) {
  p.rates.forEach((r, i) => {
    const l = `${label}.rates[${i}]`;
    if (!isHttps(r.sourceUrl))
      errs.push(`${l}.sourceUrl is required and must be an https URL`);
    if (!isIso(r.verifiedAt)) errs.push(`${l}.verifiedAt must be an ISO date`);
    if (!RATE_UNITS[r.dimension]?.includes(r.unit))
      errs.push(
        `${l}: unit "${r.unit}" is not valid for dimension "${r.dimension}"`,
      );
    if (typeof r.usd !== "number" || !(r.usd >= 0))
      errs.push(`${l}.usd must be a number >= 0`);
    if (
      r.gpuType !== undefined &&
      !(GPU_TYPES as readonly string[]).includes(r.gpuType)
    )
      errs.push(`${l}.gpuType "${r.gpuType}" is not a canonical GPU type`);
  });
  const m = p.minimums?.memoryMiB;
  if (m !== undefined && !(Number.isInteger(m) && m > 0))
    errs.push(`${label}.minimums.memoryMiB must be an integer MiB`);
}

/** Checks the auth methods of one provider. */
export function validateAuth(p: ProviderMeta): string[] {
  const errs: string[] = [];
  const at = `provider ${p.id}`;
  if (!Array.isArray(p.auth) || p.auth.length === 0) {
    errs.push(`${at}: auth must list at least one method`);
    return errs;
  }
  for (const d of dupes(p.auth.map((m) => m.id)))
    errs.push(`${at}: duplicate auth method id "${d}"`);
  const defaults = p.auth.filter((m) => m.default === true).length;
  if (defaults !== 1)
    errs.push(
      `${at}: exactly one auth method must have default: true, found ${defaults}`,
    );
  for (const m of p.auth) {
    const l = `${at}: auth "${m.id}"`;
    if (!isKebab(m.id)) errs.push(`${l}: id must be kebab-case`);
    if (!(AUTH_KINDS as readonly string[]).includes(m.kind))
      errs.push(`${l}: unknown kind "${m.kind}"`);
    if (!isHttps(m.docsUrl)) errs.push(`${l}: docsUrl must be an https URL`);
    if (!isIso(m.verifiedAt)) errs.push(`${l}: verifiedAt must be an ISO date`);
    if (!(AUTH_STATUS_VALUES as readonly string[]).includes(m.status))
      errs.push(`${l}: status must be verified or unverified`);
    if (m.status === "unverified" && !m.notes)
      errs.push(`${l}: unverified method needs the reason in notes`);
    if (!Array.isArray(m.fields)) {
      errs.push(`${l}: fields must be an array`);
      continue;
    }
    if (m.fields.some((f) => f === null || typeof f !== "object")) {
      errs.push(`${l}: every field must be an object`);
      continue;
    }
    for (const d of dupes(m.fields.map((f) => f.name)))
      errs.push(`${l}: duplicate field name "${d}"`);
    for (const f of m.fields) {
      if (typeof f.secret !== "boolean" || typeof f.required !== "boolean")
        errs.push(`${l}: field "${f.name}" needs boolean secret and required`);
      if (f.secret && f.example !== undefined)
        errs.push(`${l}: secret field "${f.name}" must not carry an example`);
      if (f.secret && f.default !== undefined)
        errs.push(`${l}: secret field "${f.name}" must not carry a default`);
    }
  }
  return errs;
}

export function validateProvider(p: ProviderMeta): string[] {
  const errs: string[] = [];
  const at = `provider ${p.id}`;
  if (!isKebab(p.id)) errs.push(`${at}: id must be kebab-case`);
  for (const k of ["website", "docs", "pricingUrl"] as const)
    if (!isHttps(p[k])) errs.push(`${at}: ${k} must be an https URL`);
  if (p.logo?.brandUrl !== undefined && !isHttps(p.logo.brandUrl))
    errs.push(`${at}: logo.brandUrl must be an https URL`);
  if (!isIso(p.verifiedAt)) errs.push(`${at}: verifiedAt must be an ISO date`);
  errs.push(...validateAuth(p));
  for (const i of p.isolation)
    if (!(ISOLATION_CLASSES as readonly string[]).includes(i))
      errs.push(`${at}: unknown isolation "${i}"`);
  for (const d of dupes(p.regions.map((r) => r.id)))
    errs.push(`${at}: duplicate region id "${d}"`);
  for (const r of p.regions)
    if (!isKebab(r.id))
      errs.push(`${at}: region id "${r.id}" must be kebab-case`);
  return errs;
}

export function validateContainerType(
  t: ContainerType,
  provider?: ProviderMeta,
): string[] {
  const errs: string[] = [];
  const at = `type ${t.provider}/${t.id}`;
  if (!isKebab(t.id)) errs.push(`${at}: id must be kebab-case`);
  if (!isKebab(t.provider)) errs.push(`${at}: provider must be kebab-case`);
  checkNumber(`${at}: vcpu`, t.vcpu, errs, false);
  checkNumber(`${at}: memoryMiB`, t.memoryMiB, errs, true);
  if (t.diskGiB !== undefined)
    checkNumber(`${at}: diskGiB`, t.diskGiB, errs, false);
  for (const g of t.gpu ?? []) {
    if (!(GPU_TYPES as readonly string[]).includes(g.type))
      errs.push(`${at}: gpu type "${g.type}" is not in the canonical list`);
    if (!Number.isInteger(g.count) || g.count < 1)
      errs.push(`${at}: gpu count must be a positive integer`);
  }
  for (const o of t.os)
    if (!(OS_VALUES as readonly string[]).includes(o))
      errs.push(`${at}: unknown os "${o}"`);
  for (const a of t.arch)
    if (!(ARCH_VALUES as readonly string[]).includes(a))
      errs.push(`${at}: unknown arch "${a}"`);
  if (!(ISOLATION_CLASSES as readonly string[]).includes(t.isolation))
    errs.push(`${at}: unknown isolation "${t.isolation}"`);
  if (t.price) validatePrice(`${at}: price`, t.price, errs);
  if (provider) {
    if (t.provider !== provider.id)
      errs.push(`${at}: provider does not match "${provider.id}"`);
    const known = new Set(provider.regions.map((r) => r.id));
    for (const r of t.regions)
      if (!known.has(r))
        errs.push(
          `${at}: region "${r}" does not exist on provider ${provider.id}`,
        );
    for (const [i, rate] of (t.price?.rates ?? []).entries())
      for (const r of Object.keys(rate.regionMultiplier ?? {}))
        if (!known.has(r))
          errs.push(
            `${at}: price.rates[${i}].regionMultiplier region "${r}" does not exist on provider`,
          );
  }
  return errs;
}

/** Validates a whole list: each record plus duplicate provider and type ids. */
export function validateProviders(providers: Provider[]): string[] {
  const errs: string[] = [];
  for (const d of dupes(providers.map((p) => p.meta.id)))
    errs.push(`duplicate provider id "${d}"`);
  for (const p of providers) {
    errs.push(...validateProvider(p.meta));
    for (const d of dupes(p.types.map((t) => t.id)))
      errs.push(`provider ${p.meta.id}: duplicate type id "${d}"`);
    for (const t of p.types) errs.push(...validateContainerType(t, p.meta));
  }
  return errs;
}
