/**
 * Provider contract for berth. Based on Turntable's provider contract
 * (packages/provider-sdk/src/types.ts, MIT, github.com/turntable-ci/turntable),
 * extended with describe(), canApply() and optional pause/resume/snapshot.
 *
 * Rule zero: no method needs a long-lived stream for correctness
 * (detached exec, logs by offset). Memory is in MiB.
 */

export type Labels = Record<string, string>;

export type IsolationClass = "container" | "gvisor" | "microvm" | "vm";
export const ISOLATION_ORDER: readonly IsolationClass[] = [
  "container",
  "gvisor",
  "microvm",
  "vm",
];
export function isolationAtLeast(
  have: IsolationClass,
  need: IsolationClass,
): boolean {
  return ISOLATION_ORDER.indexOf(have) >= ISOLATION_ORDER.indexOf(need);
}

export type EgressPolicy =
  | "none"
  | "open"
  | "allowlist"
  | "deny-all-except-proxy"
  | "proxy-domain-filtered";

export type Os = "linux" | "windows" | "macos";
export type Arch = "x86_64" | "arm64";

export interface SandboxResources {
  vcpu?: number;
  memoryMiB?: number;
  diskGiB?: number;
  gpu?: { type: string; count: number };
}

export interface EgressSpec {
  policy: EgressPolicy;
  domains?: string[];
  cidrs?: string[];
}

export type SandboxSource =
  { image: string } | { snapshot: string } | { template: string };

export interface SandboxSpec {
  source: SandboxSource;
  resources?: SandboxResources;
  egress: EgressSpec;
  labels: Labels;
  ttlSec?: number;
  region?: string;
  /** Names only, never values. */
  envNames?: string[];
}

export interface SandboxHandle {
  id: string;
  providerId: string;
}

export type SandboxState =
  "creating" | "running" | "paused" | "stopped" | "destroyed" | "unknown";

/**
 * What the provider reports back. Consumers verify this after create.
 * `resources` and `egress` hold only what the provider itself reports:
 * when `info.readback.<field>` is "none" they are empty / absent.
 */
export interface SandboxDescription {
  id: string;
  labels: Labels;
  /** Provider-reported. Empty when `info.readback.resources` is "none". */
  resources: SandboxResources;
  /** Provider-reported. Absent when `info.readback.egress` is "none". */
  egress?: EgressSpec;
  /**
   * What the adapter asked for, kept by the adapter. This is NOT confirmed by
   * the provider: never treat it as verification.
   */
  requested?: { resources?: SandboxResources; egress?: EgressSpec };
  state: SandboxState;
  region?: string;
}

/** Whether describe() can read a field back from the provider itself. */
export type ReadbackSource = "provider" | "none";

export interface ExecStartOptions {
  command: string[];
  cwd?: string;
  /** Values are passed by the adapter, never via argv or logs. */
  env?: Record<string, string>;
  timeoutSec?: number;
}

export interface ExecHandle {
  execId: string;
}

export interface ExecStatus {
  state: "running" | "exited" | "unknown";
  exitCode?: number;
}

export interface ExecLogs {
  data: string;
  /** Pass back as `offset` for the next read. */
  nextOffset: number;
}

export interface ProviderExec {
  start(id: string, options: ExecStartOptions): Promise<ExecHandle>;
  status(id: string, execId: string): Promise<ExecStatus>;
  logs(id: string, execId: string, offset: number): Promise<ExecLogs>;
}

export interface ProviderFiles {
  upload(id: string, path: string, data: Uint8Array): Promise<void>;
  download(id: string, path: string): Promise<Uint8Array>;
}

export interface ListFilter {
  labels?: Labels;
}

export interface SandboxSummary {
  id: string;
  labels: Labels;
  state: SandboxState;
}

export interface SnapshotRef {
  snapshot: string;
}

export interface ProviderInfo {
  id: string;
  isolation: IsolationClass;
  createFrom: readonly ("image" | "snapshot" | "template")[];
  exec: {
    detached: true;
    logsByOffset: true;
    streaming: boolean;
    tty: boolean;
  };
  files: boolean;
  network: {
    egressPolicy: readonly EgressPolicy[];
    domainMax?: number;
    cidrMax?: number;
    mutuallyExclusive?: boolean;
    ingress: boolean;
  };
  resources: { vcpu: boolean; memory: boolean; disk: boolean; gpu: boolean };
  ttl: boolean;
  labels: boolean;
  list: boolean;
  listByLabel: boolean;
  os: readonly Os[];
  arch: readonly Arch[];
  pause: boolean;
  snapshot: boolean;
  /**
   * Which describe() fields come from the provider. "none" means the provider
   * has no readback, so the field is left out of describe() (see `requested`).
   */
  readback: { resources: ReadbackSource; egress: ReadbackSource };
}

export interface ProviderPause {
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
}

export interface ProviderSnapshot {
  snapshot(id: string): Promise<SnapshotRef>;
}

export interface ProviderBase<I extends ProviderInfo = ProviderInfo> {
  readonly info: I;
  healthcheck(): Promise<{ ok: boolean; detail?: string }>;
  diagnose?(): Promise<Record<string, unknown>>;
  create(spec: SandboxSpec): Promise<SandboxHandle>;
  describe(id: string): Promise<SandboxDescription>;
  /** Idempotent: destroying a missing sandbox succeeds. */
  destroy(id: string): Promise<void>;
  destroyByLabels(labels: Labels): Promise<number>;
  list(filter?: ListFilter): Promise<SandboxSummary[]>;
  exec: ProviderExec;
  files: ProviderFiles;
}

/** pause/resume/snapshot exist exactly when the matching info flag is literally true. */
export type Provider<I extends ProviderInfo = ProviderInfo> = ProviderBase<I> &
  (I["pause"] extends true
    ? ProviderPause
    : { pause?: never; resume?: never }) &
  (I["snapshot"] extends true ? ProviderSnapshot : { snapshot?: never });

export type CanApplyResult = { ok: true } | { ok: false; reason: string };
