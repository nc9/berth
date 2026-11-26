# @nc9/berth-e2b

E2B adapter for the berth `Provider` contract. Uses the official `e2b` SDK, pinned exactly.

```ts
import { createE2bProvider } from "@nc9/berth-e2b";

const e2b = createE2bProvider({ apiKey }); // from the consumer, never the environment
const { id } = await e2b.create({
  source: { template: "base" },
  egress: { policy: "allowlist", domains: ["api.example.com"] },
  labels: { run: "42" },
});
```

## Mapping

- **create:** from a `template` only. Labels are E2B `metadata`. `ttlSec` is the sandbox timeout. `resources.vcpu` maps to `cpuCount`; memory, disk and GPU are fixed by the template, so asking for them throws `UnsupportedError`, as do image/snapshot sources and `region`.
- **describe / list / destroyByLabels:** from E2B's `SandboxInfo`. `memoryMiB` is E2B's `memoryMB`. `destroyByLabels({})` is refused.
- **exec:** detached. The command is started with `nohup` through a launcher script; output goes to `/tmp/.berth/exec/<id>.log`, and the exit code to `<id>.exit` when it finishes. `logs` reads the log by byte offset. Env values travel in the request body, not argv.
- **files:** E2B filesystem read/write.
- **destroy:** idempotent. **pause / resume:** `info.pause` is true. Resume uses `Sandbox.connect`, which also resumes a paused sandbox on any `exec` or `files` call.
- **egress:** `open` (no restriction), `none` (`allowInternetAccess: false`), `allowlist` (`allowOut` entries plus `denyOut: 0.0.0.0/0`; allow beats deny). Domains match only HTTP Host and TLS SNI. `deny-all-except-proxy` and `proxy-domain-filtered` throw `UnsupportedError` before any request. E2B's `denyOut` takes IPs and CIDRs only, so a domain deny list is not expressible.

## Unverified

Isolation (`microvm`) comes from a third-party source; E2B's docs do not name it. Whether metadata keys with `.` (as the conformance suite uses) are accepted is untested live.

## Tests

`bun test packages/e2b/tests/conformance.mock.test.ts` runs the conformance suite against an in-memory transport (no credentials). `conformance.live.test.ts` runs it against E2B only when `E2B_API_KEY` is set.
