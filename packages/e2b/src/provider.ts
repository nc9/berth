import {
  BerthError,
  NotFoundError,
  ProviderError,
  UnsupportedError,
  type ExecStatus,
  type Labels,
  type Provider,
  type ProviderInfo,
  type SandboxDescription,
  type SandboxSpec,
  type SandboxSummary,
} from "@nc9/berth-sdk";
import { mapEgress, readEgress } from "./egress.ts";
import { createSdkTransport } from "./sdk-transport.ts";
import type { E2bSandboxInfo, E2bTransport } from "./transport.ts";

export const E2B_INFO = {
  id: "e2b",
  // Firecracker per a third-party source; E2B's docs do not name it (unverified).
  isolation: "microvm",
  createFrom: ["template"],
  exec: { detached: true, logsByOffset: true, streaming: false, tty: false },
  files: true,
  network: {
    // Domain and CIDR allow lists combine; no domainMax/cidrMax documented.
    egressPolicy: ["none", "open", "allowlist"],
    mutuallyExclusive: false,
    ingress: false,
  },
  // Size is fixed by the template: only vcpu can be chosen (up to the
  // template's maxCpuCount); memory, disk and GPU cannot.
  resources: { vcpu: true, memory: false, disk: false, gpu: false },
  ttl: true,
  labels: true,
  list: true,
  listByLabel: true,
  os: ["linux"],
  arch: ["x86_64"],
  pause: true,
  snapshot: false,
} as const satisfies ProviderInfo;

export type E2bProvider = Provider<typeof E2B_INFO>;

export interface E2bOptions {
  /** From the consumer; never read from the environment (E2B_* variables are ignored), never logged. */
  apiKey: string;
  /** Override E2B's domain (self-hosted). */
  domain?: string;
  apiUrl?: string;
  /** Required with a custom `domain`; defaults to E2B's own otherwise. */
  sandboxUrl?: string;
  /** Test seam. Defaults to the official `e2b` SDK. */
  transport?: E2bTransport;
}

const EXEC_DIR = "/tmp/.berth/exec";
const paths = (execId: string) => ({
  logPath: `${EXEC_DIR}/${execId}.log`,
  exitPath: `${EXEC_DIR}/${execId}.exit`,
});
const EXEC_ID = /^[a-z0-9-]+$/;

/** Index after the last complete UTF-8 sequence, so a page never splits a character. */
export function completeUtf8End(bytes: Uint8Array): number {
  for (let back = 1; back <= Math.min(3, bytes.length); back++) {
    const b = bytes[bytes.length - back] ?? 0;
    if ((b & 0xc0) === 0x80) continue; // continuation byte, keep looking
    const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
    return need > back ? bytes.length - back : bytes.length;
  }
  return bytes.length;
}

/** Replaces every occurrence of the key in a message. */
export function redact(message: string, secret: string): string {
  return secret === "" ? message : message.split(secret).join("[redacted]");
}

export function createE2bProvider(options: E2bOptions): E2bProvider {
  const { apiKey } = options;
  if (typeof apiKey !== "string" || apiKey === "")
    throw new BerthError("e2b: apiKey is required");
  const transport =
    options.transport ??
    createSdkTransport({
      apiKey,
      ...(options.domain !== undefined && { domain: options.domain }),
      ...(options.apiUrl !== undefined && { apiUrl: options.apiUrl }),
      ...(options.sandboxUrl !== undefined && {
        sandboxUrl: options.sandboxUrl,
      }),
    });

  /**
   * Runs a transport call. Berth errors pass through; anything else becomes a
   * ProviderError with a redacted message and no `cause` (SDK errors can
   * carry request details).
   */
  async function call<T>(what: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof BerthError) {
        if (err.message.includes(apiKey))
          throw new ProviderError("e2b", redact(err.message, apiKey));
        throw err;
      }
      const raw = err instanceof Error ? err.message : String(err);
      throw new ProviderError("e2b", `${what} failed: ${redact(raw, apiKey)}`);
    }
  }

  const describeInfo = (i: E2bSandboxInfo): SandboxDescription => ({
    id: i.sandboxId,
    labels: i.metadata,
    resources: { vcpu: i.cpuCount, memoryMiB: i.memoryMB },
    egress: readEgress(i),
    state: i.state,
  });

  const matches = (have: Labels, want: Labels) =>
    Object.entries(want).every(([k, v]) => have[k] === v);

  const listAll = async (labels: Labels): Promise<E2bSandboxInfo[]> =>
    (await call("list", () => transport.list(labels))).filter((i) =>
      matches(i.metadata, labels),
    );

  const provider = {
    info: E2B_INFO,

    async healthcheck() {
      try {
        await call("healthcheck", () => transport.list({}));
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          detail: err instanceof Error ? err.message : "unreachable",
        };
      }
    },

    async create(spec: SandboxSpec) {
      // Everything that can be refused is refused before the first request.
      const network = mapEgress(E2B_INFO, spec.egress);
      const source = spec.source;
      if (!("template" in source))
        throw new UnsupportedError(
          "e2b: sandboxes are created from a template; image and snapshot sources are not supported",
        );
      const r = spec.resources;
      if (r?.memoryMiB !== undefined || r?.diskGiB !== undefined || r?.gpu)
        throw new UnsupportedError(
          "e2b: memory, disk and GPU are fixed by the template and cannot be requested",
        );
      if (spec.region !== undefined)
        throw new UnsupportedError("e2b: region selection is not supported");
      const { sandboxId } = await call("create", () =>
        transport.create({
          template: source.template,
          metadata: spec.labels,
          ...(spec.ttlSec !== undefined && { timeoutMs: spec.ttlSec * 1000 }),
          ...(r?.vcpu !== undefined && { cpuCount: r.vcpu }),
          ...(network && { network }),
        }),
      );
      return { id: sandboxId, providerId: E2B_INFO.id };
    },

    async describe(id: string) {
      return describeInfo(await call("describe", () => transport.getInfo(id)));
    },

    async destroy(id: string) {
      await call("destroy", () => transport.kill(id));
    },

    async list(filter?: { labels?: Labels }): Promise<SandboxSummary[]> {
      return (await listAll(filter?.labels ?? {})).map((i) => ({
        id: i.sandboxId,
        labels: i.metadata,
        state: i.state,
      }));
    },

    async destroyByLabels(labels: Labels) {
      if (Object.keys(labels).length === 0)
        throw new BerthError("e2b: destroyByLabels needs at least one label");
      const found = await listAll(labels);
      let n = 0;
      for (const i of found) {
        if (await call("destroy", () => transport.kill(i.sandboxId))) n++;
      }
      return n;
    },

    async pause(id: string) {
      await call("pause", () => transport.pause(id));
    },

    async resume(id: string) {
      await call("resume", () => transport.resume(id));
    },

    exec: {
      async start(
        id: string,
        o: {
          command: string[];
          cwd?: string;
          env?: Record<string, string>;
          timeoutSec?: number;
        },
      ) {
        if (o.command.length === 0)
          throw new BerthError("e2b: exec needs a command");
        const execId = crypto.randomUUID();
        await call("exec", () =>
          transport.spawn(id, {
            ...paths(execId),
            argv: o.command,
            ...(o.cwd !== undefined && { cwd: o.cwd }),
            ...(o.env && { envs: o.env }),
            ...(o.timeoutSec !== undefined && { timeoutSec: o.timeoutSec }),
          }),
        );
        return { execId };
      },

      async status(id: string, execId: string): Promise<ExecStatus> {
        const { logPath, exitPath } = paths(checkExecId(execId));
        const exit = await readOptional(id, exitPath);
        if (exit) {
          const code = Number.parseInt(
            new TextDecoder().decode(exit).trim(),
            10,
          );
          return Number.isNaN(code)
            ? { state: "unknown" }
            : { state: "exited", exitCode: code };
        }
        // No exit file yet: running if the log exists, otherwise never started.
        return (await readOptional(id, logPath))
          ? { state: "running" }
          : { state: "unknown" };
      },

      async logs(id: string, execId: string, offset: number) {
        const { logPath } = paths(checkExecId(execId));
        const bytes = await call("logs", () => transport.readFile(id, logPath));
        const start = Math.min(Math.max(0, offset), bytes.length);
        const end = Math.max(start, completeUtf8End(bytes));
        const data = new TextDecoder().decode(bytes.subarray(start, end));
        return { data, nextOffset: end };
      },
    },

    files: {
      async upload(id: string, path: string, data: Uint8Array) {
        await call("upload", () => transport.writeFile(id, path, data));
      },
      async download(id: string, path: string) {
        return call("download", () => transport.readFile(id, path));
      },
    },
  };

  function checkExecId(execId: string): string {
    if (!EXEC_ID.test(execId)) throw new NotFoundError("e2b: unknown exec");
    return execId;
  }

  /** Reads a file, or undefined when it does not exist. */
  async function readOptional(
    id: string,
    path: string,
  ): Promise<Uint8Array | undefined> {
    try {
      return await call("read", () => transport.readFile(id, path));
    } catch (err) {
      if (!(err instanceof NotFoundError)) throw err;
      // Missing file, or missing sandbox? getInfo throws NotFoundError for the latter.
      await call("read", () => transport.getInfo(id));
      return undefined;
    }
  }

  return provider as unknown as E2bProvider;
}
