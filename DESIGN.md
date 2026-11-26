# berth: design (2026-11-26)

This proposal draws on the research in `research-container-providers-native.md` (Modal, Daytona, E2B, boxd, Morph, Vercel, Cloudflare, Fly, Runloop, Northflank, Beam, and the pi-ai pattern) and `research-container-providers-clouds.md` (AWS, Azure, GCP). Prices and claims are cited there.

Nik's direction (chat, 2026-11-26): build one library, in the style of pi-ai, that lists compute providers. For each provider it records metadata (name, logo, website, description), its container types (size, region, CPU/GPU, OS), what it can do, and what it costs per unit of container time. Longshore and Turntable both consume it. Configuration is per org. Later, use run stats (startup time, latency, error rate) to route each task to the best provider. Expect about 20 providers eventually.

## 1. Layers: what is global, per server and per org

| Layer | Holds | Where it lives |
|---|---|---|
| Catalog | Providers, container types, regions, capabilities, prices | The library: hand-curated data plus API refreshers. Global, like pi-ai's model list. |
| Adapters | One lifecycle implementation per provider behind one interface | The library: one package per provider |
| Server ceiling | Which provider kinds this server allows; an optional server-owned default account (today's Daytona) | Each product's admin settings (DB config) |
| Org | Provider accounts (credentials in the org vault), enabled providers, chosen container types and overrides, GPU and budget caps, routing policy | Each product, per org (Longshore #350 Part 1) |
| Stats | Per-run measurements | Each product's DB. An org sees its own; the server admin sees them combined across orgs. |

Startup time and error rate belong to the provider, not the org. Combining them across orgs gives the router a usable signal much sooner.

## 2. Library layout (one repo, several packages)

- **`sdk`**
  - The `Provider` interface. It starts from Turntable's `packages/provider-sdk`, the most mature of our interfaces, and adds:
    - optional `pause` / `resume` / `snapshot`, each gated by a capability flag (as `adopt?` and `diagnose?` are today);
    - `canApply(egressPolicy)`;
    - a required `describe(id)` that returns the sandbox's labels, resources and network as the provider reports them. The products build their fail-closed readback on it.
  - Turntable's no-long-lived-stream rule stays: detached exec and logs read by offset.
- **`catalog`**
  - The records in section 3, as committed typed data (like pi-ai's `models.generated.ts`).
  - Each provider has a `refresh()` for the parts its API can list:
    - Daytona: sandbox classes, regions, snapshots, GPU types;
    - E2B: templates;
    - EC2, GCE and Azure: instance types, with credentials.
  - The Azure Retail Prices API needs no auth. Every other price is curated, with `verifiedAt` and `sourceUrl`.
  - A scheduled job re-checks prices and opens a PR for any diff. We could also publish the catalog JSON, as pi.dev does.
- **`conformance`**: Turntable's `provider-conformance`, moved here. Every adapter must pass it in both products.
- **`adapters/<id>`**: one package per provider, so a consumer installs only what it uses (as ComputeSDK and pi-ai do).
- **What stays out of the library:** policy. Trust tiers, ownership rules (Longshore's `lsr-` name plus `ls.run` / `ls.fleet` labels), egress mapping and the canary, ceilings, secrets resolution and approvals all stay in each product. The library only reports facts and carries out requests.

## 3. Records

- **`ProviderMeta`**
  - Identity: `id`, `name`, `website`, `docs`, `pricingUrl`, `description`.
  - `logo {simpleIcons? | svg | brandUrl}`. simple-icons covers only Modal, Vercel, Cloudflare and Fly; the rest need vendored SVGs, and their licences still need checking.
  - `envVars` (credential names only), `isolation[]`, `regions[{id, name, geo, selectable, priceMultiplier?}]`.
  - `sizingMode`: free-form | presets | template | snapshot | memory-only.
  - `freeTier`, `status` (ga | preview | closed-core | unverified), `verifiedAt`.
- **`Capabilities`** (per provider, overridable per type)
  - `createFrom[]`, `snapshots {fs, memory, fork}`, `pause {supported, keepsMemory}`.
  - `egress {policies[], domainMatch: sni|dns, domainMax, cidrMax, mutuallyExclusive, runtimeUpdate}`. Example: Daytona allows one kind at a time, with at most 100 domains and 10 CIDRs. Modal's domain and CIDR lists combine.
  - `maxLifetimeSec`, `minBillingSec`, `exec {detached, streaming, tty}`, `files {upload, download, maxBytes}`, `labels`, `list`, `ingress`.
  - `discovery {types, regions, pricing: api|docs}`.
- **`ContainerType`**
  - `id`, `provider`, `kind` (preset | template | free-form range).
  - `vcpu`, `memoryMiB`, `diskGiB`, each a number or a range.
  - `gpu[{type, count, vramGiB, preemptible}]`, using canonical GPU ids across providers.
  - `os[]` (linux | windows | macos), `arch[]`, `isolation`, `regions[]`, `limits`, `price`.
- **`PriceBook`**
  - `currency`.
  - `billing`: wall-clock | active-cpu | memory-only | active-cpu+provisioned-memory. Vercel and Cloudflare bill active CPU only, so a single hourly number is wrong.
  - `granularity`, `minimums`.
  - `rates[{dimension: vcpu|memory|disk|gpu|creation|egress|snapshot-storage, unit, usd, raw: {value, unit}}]`. Keeping the vendor's raw value next to it makes conversions auditable; for example, a Modal "core" is 2 vCPU.
  - `verifiedAt`, `sourceUrl`.
- **`estimateCost(type, usage)`**: as pi-ai's `calculateCost`. When the provider reports billed cost, that beats the estimate.

Units: memory is in MiB everywhere. Turntable's `memoryMb` is already MiB in practice; rename it at extraction.

## 4. Stats and routing (product side, phase 3)

- **Per-run row:** provider, region, container type, create-to-ready ms, setup ms, failure phase and kind, estimated cost, billed cost when the provider reports it.
- **Aggregates:** p50/p95 ready time, error rate by phase, and cost per run-minute, grouped by provider, region and type. The org view is scoped to the org; the server-admin view combines orgs.
- **Router:**
  1. **Hard filter** on OS, GPU, minimum isolation by trust tier, region, ceilings and budget, plus `canApply(egress)`. A provider that cannot enforce the run's egress policy is never a candidate (fail closed).
  2. **Score** by the org's policy: cost, latency, reliability, or weights between them. Pin by agent type when the org wants it.
  3. **Record** which candidate was picked and why.

## 5. Adapter order

1. **Daytona** in the library, unifying Turntable's and Longshore's adapters. Both products switch to it with no behaviour change; this proves the extraction.
2. **Modal** (first GPU provider; Longshore #350 Part 2).
3. **E2B.** The cheapest common size, with templates and pause/resume.
4. **Azure Container Apps Sandboxes.** The only hyperscaler product with a native domain allowlist, plus snapshots and sub-second start. Preview status and rates are unconfirmed.
5. **AWS EC2** (Turntable's Windows and macOS; Mac Dedicated Hosts have a 24 h minimum) and **AWS Lambda MicroVMs** (agent runs; no native domain allowlist).
6. The rest by demand: boxd, Morph, Vercel, Cloudflare, Fly Sprites, Blaxel, Runloop, Northflank, Beam, GCP Cloud Run jobs and GKE Agent Sandbox.

## 6. Migration

- **Phase 0:** create the library repo. Move in Turntable's `provider-sdk`, `provider-conformance` and `provider-daytona`. Turntable consumes them from there (a git dependency through bun, or a package registry). Its tests must stay green. Coordinate with the Turntable session.
- **Phase 1:** Longshore adapts its `SandboxProvider` onto the library `Provider`. Ownership checks and the egress readback stay in Longshore, built on `describe()`. The legacy golden test must not change.
- **Phase 2:** the catalog (records and refreshers), and Longshore #350 Part 1 validating container types against it. The admin UI shows the catalog with logos, sizes and prices.
- **Phase 3:** Modal adapter, then stats, then routing.

## 7. Decisions (Nik, via chat, 2026-11-26)

- Name `berth`, repo `nc9/berth`, packages `@nc9/berth` (catalog + sdk) and `@nc9/berth-<provider>` (adapters), MIT.
- The catalog ships in the package AND as public JSON. A scheduled job re-checks prices and publishes `catalog.json`, and released clients merge it over their built-in data, as pi.dev does.
- "boat.dev" = boxd (boxd.sh) and "Myrtle" = Morph (Morph Cloud); both are on the adapter backlog.
- Config is per org in each consumer; the catalog and adapters are global.

## 8. Earlier open decisions (resolved above)

1. **Repo:** name and location (your personal account), and a licence compatible with Longshore and Turntable both being open source (MIT or Apache-2.0).
2. **Provider names:** confirm that "boat.dev" means boxd (boxd.sh, KVM microVMs, EU) and "Myrtle" means Morph (Morph Cloud). Neither identification is certain.
3. **Catalog publishing:** publish it as a public JSON (like pi.dev's catalog), or keep it in the package only.
4. **Who builds it:** Longshore runs against the new repo once it exists as a Longshore project. That needs an org/project for your personal account, plus the GitHub App installed there (your click).

## 9. Turntable constraints for Phase 0 (2026-11-26)

1. **berth must be public before Phase 0.** Turntable is a public MIT repo with public CI and self-hosters, so it cannot depend on a private repo.
2. **Consumption:** public npm `@nc9/berth*` with trusted publishing and provenance, consumed at EXACT versions with bun.lock integrity. The interim is a git dependency pinned to a full 40-hex sha (never a branch, tag or range). Every bump is a Turntable hold-list PR.
3. **Policy vs mechanism split** is written down before the move.
   - **Stays in Turntable:** cpuLimit owner preflight, live max_live and cpu settings (#661), the snapshot and size-class map, egress and isolation policy.
   - **Moves to berth:** create, exec, log reader, files, describe, destroy.
   - Turntable's tests, conformance included, must pass against the moved packages in Turntable's CI.
4. **Guards travel with the code:** the net source guard (no global fetch, only the outbound client), the spawn-env guard and conformance. `@turntable/net` and `@turntable/redact` either move into berth or become its dependencies.
5. **Timing:** after Turntable #695, #696, #698 and #689 are LIVE, plus about 24 h stable; not before 2026-11-27. Until then berth builds the catalog and new adapters only.
6. Turntable's dependency-age gate (2 weeks) needs a first-party exemption for berth releases, which is a Turntable hold-list change.
7. **Hosted:** the first berth-based Turntable build gets pre-deploy config validation and a parity run before it is trusted.
