# @nc9/berth

Catalog of container and sandbox providers: providers, container types, capabilities and prices.

## Install

```sh
bun add @nc9/berth
```

Zero runtime dependencies. Memory is in MiB everywhere.

## Use

```ts
import { catalog } from "@nc9/berth";

// All providers (name, website, docs, regions, status, verifiedAt).
catalog.getProviders();

// Filter container types.
const types = catalog.find({
  os: "linux",
  gpuType: "h100",
  minMemoryMiB: 16384,
  minIsolation: "microvm",
  egress: "allowlist",
  status: "ga",
});

// Estimate cost. Range types need vcpu / memoryMiB; active-cpu billing needs cpuSeconds.
const { usd, breakdown, skipped, verifiedAt } = catalog.estimateCost(
  types[0]!,
  {
    seconds: 3600,
    vcpu: 2,
    memoryMiB: 4096,
    region: "us-east",
  },
);
```

`estimateCost` prices only time-based dimensions (vcpu, memory, gpu, and disk when `diskGiBHours` is given). Rates it did not use are listed in `skipped`, so `usd` is never silently partial.

## Auth methods

Each provider lists how to authenticate in `meta.auth`: one or more methods (`api_key`, `token_pair`, `iam_keys`, `iam_role`, ...), exactly one marked `default`. A method has `fields` with a stable `name`, the `env` variable exactly as the vendor docs name it (omitted when they name none), `secret`, `required` and a description. Non-secret fields (API URL, region, project id) may carry an `example` or `default`; secret fields never do. `envVars` is derived from the default method's fields. A method not confirmed in the vendor docs is `status: "unverified"` with the reason in `notes`.

Consumers store the config and check it with field presence only, never secret values:

```ts
import { validateAuthConfig } from "@nc9/berth";

validateAuthConfig("modal", "token-pair", { "token-id": "present" });
// { missing: ["token-secret"], unknown: [], inlineSecrets: [], ok: false }
```

## Add a custom provider

`createCatalog` validates the data and throws listing every error.

```ts
import { builtInProviders, createCatalog, type Provider } from "@nc9/berth";

const acme: Provider = {
  meta: { id: "acme" /* name, website, docs, pricingUrl, regions, ... */ },
  types: [
    { id: "small", provider: "acme" /* vcpu, memoryMiB, os, arch, ... */ },
  ],
};
const mine = createCatalog([...builtInProviders, acme]);
```

## Pick up newer prices without upgrading

The catalog is also built as public JSON (`bun scripts/build-catalog.ts` writes `dist/catalog.json` and `dist/catalog.schema.json`). `mergeCatalog` overlays a fetched copy on the built-in data:

```ts
import { builtInProviders, createCatalog, mergeCatalog } from "@nc9/berth";

const remote = await (await fetch(url)).json();
const mine = createCatalog(mergeCatalog(builtInProviders, remote));
```

- A remote provider wins only when its `meta.verifiedAt` is newer.
- Providers the built-in data does not know are added.
- A malformed remote is ignored with a warning (pass `{ warn }` to capture it); an invalid provider inside it is skipped.
- Each remote provider is checked against the published JSON Schema and the validators. The remote source must still be trusted: a newer `meta.verifiedAt` replaces the whole built-in provider, rates included.

`bun run catalog:check` validates the built JSON against the schema and the validators and exits non-zero on any error.

## Logos

Each provider's `logo.files` points at committed brand images (`packages/berth/assets/logos/<id>/<icon|logo>-<light|dark|opaque>.<svg|png>`) fetched from context.dev by `bun scripts/fetch-logos.ts` (manual, needs `CONTEXT_DEV_API_KEY`, not run in CI). SVGs are sanitized before commit (`sanitizeSvg`); `manifest.json` records the domain, retrieval time and source URL of each file, or `missing: true` with a reason (`opaque` is context.dev's `has_opaque_background` variant, used for both themes; providers with no usable image are `missing`, and aws and daytona need a rerun with an API key to fetch theirs).

Logos are trademarks of their owners, included for identification only.

**Storage: plain git, not LFS.** 23 images (14 SVG, 9 PNG) plus the manifest total about 260 KB, the largest file under 512 KB. SVG is text and diffs well. LFS would need `lfs: true` in CI checkout and would break `bun install` from a git dependency and npm packaging for a few hundred KB.

## Data rules

- Every price rate carries `verifiedAt`, a `sourceUrl` (https) and, where the vendor states one, the raw value and unit (`raw`) so conversions can be audited.
- Nothing is invented: a field the provider does not document is marked `unverified` (for example `status: "unverified"`, `freeTier: "unverified"`).
- Validators: `validateProvider`, `validateContainerType` and `validateProviders` return arrays of error strings.
- No policy: berth reports facts. Trust tiers, ownership rules and ceilings belong to the consumer.
