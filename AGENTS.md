# berth

A container and sandbox provider registry and SDK, shared by Longshore and Turntable. Read `DESIGN.md` first.

- **Tooling:** bun built-ins only: `bun check` (typecheck), `bun fmt` / `bun fmt --check`, and `bun test` with explicit file paths. No eslint, prettier or tsc. TypeScript only, kebab-case file names.
- **Layout (planned):** `packages/sdk` (the `Provider` interface), `packages/catalog` (records plus refreshers), `packages/conformance`, `packages/<provider>` (adapters).
- **Data rules:**
  - Every price carries `verifiedAt` and `sourceUrl`, plus the vendor's raw value and unit.
  - Never invent a field a provider does not document; mark it `unverified`.
  - Memory is in MiB.
- **No policy:** no trust tiers, ownership rules, egress mapping or ceilings. Consumers own policy; adapters report facts (`describe()`) so consumers can verify after create.
- **Secrets:** never in argv, logs, test fixtures or catalog data. Credentials come from the consumer at construction.
- **Commits:** `type(scope): message`, no attribution lines.
