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

## Changes go through Longshore

This repo is built by Longshore runs: **issue first**. The spec lives in a GitHub issue with a `## Acceptance Criteria` heading. A run is started with `Implement #N`, and review and fix rounds point at the PR.

**If you are a Longshore run** (`LONGSHORE_RUN_ID` is set):

- **Reading:** read the issue and PR threads with `gh api repos/{owner}/{repo}/issues/N` and `.../issues/N/comments` (this works for PRs too). Review and fix rounds MUST read the latest review this way.
- **Claim:** `claim_acquire {kind: "issue", key: "N"}` before starting; release it at the end. If the issue is unclear or wrong, ask with `ask_operator` and wait with `ask_wait`. Never guess.
- **Branch and commits:** branch `<type>/<slug>` from `main`; never commit to `main`. Small conventional commits (`type(scope): msg`) with no attribution lines. Do not change the git identity.
- **Push:** push after every milestone, and keep the first push inside 25 minutes. Post a one-line `run_report` at each milestone.
- **Before every push:** `bun fmt --check`, `bun run typecheck`, then `bun run test`. Tests run only from `tests.txt` (explicit files). Add every new test file to `tests.txt` (sorted; `scripts/test-list.test.ts` fails otherwise). Never run a bare `bun test` or a directory.
- **PR:**
  - Open it as a draft: `gh pr create --draft --base main --head <branch>`, with `Closes #N` in the body and the PR template filled in.
  - When every gate passes, mark it ready ONCE (`gh pr ready`). Never merge.
  - Run tokens cannot push `.github/workflows/`: stage workflow changes under `.longshore/staged-workflows/` and say so in the PR.
- **Finish:** end with `run_complete` exactly once, with per-criterion results, each carrying its `index` from `run_self.criteria`.
- **Feedback:** when Longshore itself gets in the way (tools, sandbox, git or PR flow), send it with `feedback_send`.

## Package rules

- **Layout:** one package per directory under `packages/`, published as `@nc9/berth` (sdk and catalog) and `@nc9/berth-<provider>` (adapters). Packages import each other through workspace names, never relative paths across packages.
- **Dependencies:** zero runtime dependencies in `@nc9/berth` unless an issue allows one. Adapters may depend on their vendor SDK, pinned exactly.
- **Data:** catalog data is plain typed TS/JSON. Every price carries `verifiedAt`, `sourceUrl`, and the vendor's raw value and unit. Never invent a field a provider does not document: mark it `unverified` instead.
