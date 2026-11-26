/**
 * The narrow surface the adapter needs from E2B. The default implementation
 * (sdk-transport.ts) wraps the official `e2b` package; CI runs the
 * conformance suite against an in-memory implementation instead.
 *
 * Implementations throw `NotFoundError` (from @nc9/berth-sdk) for a missing
 * sandbox or file, and must never put the API key in a thrown message.
 */
export interface E2bNetwork {
  allowInternetAccess?: boolean;
  allowOut?: string[];
  denyOut?: string[];
  dnsServers?: string[];
  /** Always false from this adapter: sandbox ports require E2B auth. */
  allowPublicTraffic?: boolean;
}

export interface E2bCreateOptions {
  template: string;
  metadata: Record<string, string>;
  timeoutMs?: number;
  cpuCount?: number;
  network?: E2bNetwork;
}

/** What E2B reports about a sandbox (the fields of its SandboxInfo we use). */
export interface E2bSandboxInfo {
  sandboxId: string;
  metadata: Record<string, string>;
  state: "running" | "paused";
  cpuCount: number;
  memoryMB: number;
  /** E2B reports `allowInternetAccess` only when it was set. */
  allowInternetAccess?: boolean;
  network?: {
    allowOut?: string[];
    denyOut?: string[];
    dnsServers?: string[];
    allowPublicTraffic?: boolean;
  };
}

export interface E2bSpawnOptions {
  /** Output goes to `logPath`; the exit code is written to `exitPath` when done. */
  logPath: string;
  exitPath: string;
  argv: string[];
  cwd?: string;
  /** Values travel in the request body, never argv. */
  envs?: Record<string, string>;
  timeoutSec?: number;
}

export interface E2bTransport {
  create(options: E2bCreateOptions): Promise<{ sandboxId: string }>;
  getInfo(sandboxId: string): Promise<E2bSandboxInfo>;
  /** Every sandbox (running and paused) whose metadata contains `metadata`. */
  list(metadata: Record<string, string>): Promise<E2bSandboxInfo[]>;
  /** Returns false when the sandbox does not exist. */
  kill(sandboxId: string): Promise<boolean>;
  pause(sandboxId: string): Promise<void>;
  resume(sandboxId: string): Promise<void>;
  /** Starts a detached process and returns without waiting for it. */
  spawn(sandboxId: string, options: E2bSpawnOptions): Promise<void>;
  readFile(sandboxId: string, path: string): Promise<Uint8Array>;
  /**
   * At most `limit` bytes of a file starting at `offset`, read inside the
   * sandbox so the transfer is bounded. Throws NotFoundError when the file
   * does not exist.
   */
  readRange(
    sandboxId: string,
    path: string,
    offset: number,
    limit: number,
  ): Promise<Uint8Array>;
  writeFile(sandboxId: string, path: string, data: Uint8Array): Promise<void>;
}
