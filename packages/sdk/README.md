# @nc9/berth-sdk

The provider contract every berth adapter implements: types plus small pure helpers, with zero runtime dependencies.

## In it

- Primitive types: `Labels`, `IsolationClass` (with `ISOLATION_ORDER`, `isolationAtLeast`), `EgressPolicy`, `Os`, `Arch`, `SandboxResources`.
- `SandboxSpec`, `SandboxHandle`, `SandboxDescription` (what the provider reports back, for verify-after-create), the detached exec types (start, status, logs by offset) and `ProviderFiles`.
- `Provider` and `ProviderInfo`. `pause` / `resume` / `snapshot` exist exactly when the matching `info` flag is `true`.
- `canApply(info, egress)`: a pure check of an egress request against what a provider can enforce.
- Errors: `BerthError`, `NotFoundError`, `UnsupportedError`, `LimitExceededError`, `ProviderError`.

## Not in it

Policy. Trust tiers, ownership rules, egress mapping and ceilings belong to consumers. The sdk only describes what a provider can do and lets consumers verify what it did. No method needs a long-lived stream for correctness.

Memory is in MiB.

Based on Turntable's provider contract (`packages/provider-sdk`, MIT).
