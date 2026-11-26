# @nc9/berth-conformance

The suite every berth adapter must pass, plus an in-memory fake provider. Runtime dependency: `@nc9/berth-sdk` only. It registers `bun:test` tests, so run it with `bun test`.

Ported in spirit from Turntable's `packages/provider-conformance` (MIT, github.com/turntable-ci/turntable).

## What it checks

- **create:** `create` then `describe` reports the requested labels and resources.
- **exec:** a detached exec reports status and exit code; logs read by offset page with no gaps or duplicates.
- **files:** upload/download round-trip (skipped when `info.files` is false).
- **destroy:** idempotent; `describe` afterwards throws `NotFoundError`.
- **labels:** `list` by label and `destroyByLabels` (skipped when `info` says unsupported).
- **pause / snapshot:** run only when `info.pause` / `info.snapshot` is `true`.
- **egress:** `create` with a policy that `canApply` refuses throws `UnsupportedError` and creates nothing. Skipped when the provider's `info` refuses nothing.

## Usage

`runConformance(name, makeProvider, opts)`. `makeProvider` is called once, synchronously, to read `info`; it must not touch the network. Options: `skip` (categories), `timeoutMs`, `timeouts` (per category), `baseSpec` (source, region, resources), `execWaitMs`.

### Against the real provider, gated on credentials

```ts
// packages/acme/tests/conformance.live.test.ts
import { runConformance } from "@nc9/berth-conformance";
import { createAcmeProvider } from "../src/index.ts";

const apiKey = process.env.ACME_API_KEY;

if (apiKey) {
  runConformance("acme (live)", () => createAcmeProvider({ apiKey }), {
    timeoutMs: 120_000,
    baseSpec: { source: { image: "alpine:3" }, region: "eu" },
  });
} else {
  console.warn("ACME_API_KEY not set: skipping live conformance");
}
```

Credentials come from the environment at construction, never from fixtures. Keep live files out of `tests.txt` (CI has no credentials) and run them explicitly: `ACME_API_KEY=... bun test packages/acme/tests/conformance.live.test.ts`.

### Mocked transport, for CI

Have the adapter take its HTTP client as a constructor argument, and give the suite a transport that emulates the vendor API (a tiny in-memory server behind `fetch`). Then the same suite runs in CI with no credentials:

```ts
// packages/acme/tests/conformance.mock.test.ts
import { runConformance } from "@nc9/berth-conformance";
import { createAcmeProvider } from "../src/index.ts";
import { mockAcmeFetch } from "./mock-acme-fetch.ts";

runConformance(
  "acme (mock transport)",
  () => createAcmeProvider({ apiKey: "test-key", fetch: mockAcmeFetch() }),
  { timeoutMs: 5_000 },
);
```

List the mock file in `tests.txt`.

## The fake

`createFakeProvider({ info?, logPageSize? })` (`src/fake.ts`) is an in-memory `Provider`. Its `info` is configurable, and `pause` / `snapshot` methods exist exactly when those flags are `true`, so the optional paths are exercised both ways. Its exec model understands `echo` and `false`; any other command exits 0 with no output. `packages/conformance/tests/` runs the suite against it with pause and snapshot on and off.
