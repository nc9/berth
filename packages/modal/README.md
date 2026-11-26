# @nc9/berth-modal

Modal Sandbox adapter for berth, built on Modal's official JS SDK (`modal`, pinned exactly).

```ts
import { createModalProvider } from "@nc9/berth-modal";

const modal = createModalProvider({ tokenId, tokenSecret, appName: "berth" });
```

Credentials come from the consumer at construction. The adapter never reads them from its own env, never logs, and redacts them from every error (SDK errors are wrapped; no `cause` is kept).

## Mapping

- `create`: image, `cpu` (= vcpu / 2, since a Modal core is 2 vCPU), memory (MiB), gpu (`TYPE` or `TYPE:n`), `timeoutMs` from `ttlSec`, `regions`, tags from labels. Snapshot/template sources and disk size are refused with `UnsupportedError`.
- Egress: `none` = `blockNetwork`; `allowlist` = domain and CIDR allowlists (combinable); `open` = no policy. Anything else, or an empty allowlist (which Modal would treat as allow-all), is refused before anything is created. `domainMax` / `cidrMax` are not documented by Modal and are left unset.
- `exec`: detached. Output of stdout and stderr is collected in memory so logs read by offset; exec state lives in the adapter process, so after a restart `status` is `unknown`.
- `files`: download uses the SDK; upload pipes bytes through `cat` over stdin because the SDK has no write call.
- `destroy` is idempotent; a terminated sandbox is reported as `NotFoundError` by `describe`. `list` / `destroyByLabels` use tags (`destroyByLabels({})` is refused).

## Known limits

- The SDK exposes no readback of resources or egress. `describe` returns what the adapter recorded in reserved `berth.modal/*` tags at create time, which is an echo and not Modal's own report. Do not treat it as independent verification.
- The Modal SDK itself may read `MODAL_*` env vars and `~/.modal.toml` for non-credential settings (server URL and the like). Explicit tokens passed here take precedence.

## Tests

The conformance suite runs in CI against a fake Modal client. To run it live, set `BERTH_MODAL_TOKEN_ID` and `BERTH_MODAL_TOKEN_SECRET` and run `bun test packages/modal/tests/conformance.test.ts`; without them the live suite is skipped.

## Notes

- Without `ttlSec` no timeout is sent, so Modal's default sandbox lifetime (5 minutes) applies. Pass `ttlSec` for anything longer.
- `cpu` and `memoryMiB` are Modal reservations: Modal documents bursting above them. The hard limits are `cpuLimit` / `memoryLimitMiB`, which this adapter does not set. `describe` reports the reservation.
- `arch` is empty: Modal does not document it.
- Exec ids are random and bound to their sandbox; exec records live in memory only, are dropped on `destroy`, and output is capped at 16 MiB per exec (later output is dropped). Ids do not survive a restart.
- Missing sandboxes: the SDK's `fromId` makes no RPC, so not-found surfaces from `poll`/`terminate` as a gRPC NOT_FOUND and is mapped to `NotFoundError` (`destroy` ignores it).
