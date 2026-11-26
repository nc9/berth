import { ModalClient, NotFoundError as ModalNotFoundError } from "modal";
import {
  BerthError,
  canApply,
  NotFoundError,
  ProviderError,
  UnsupportedError,
  type EgressSpec,
  type ExecLogs,
  type ExecStartOptions,
  type ExecStatus,
  type Labels,
  type Provider,
  type ProviderInfo,
  type SandboxDescription,
  type SandboxHandle,
  type SandboxResources,
  type SandboxSpec,
  type SandboxState,
  type SandboxSummary,
} from "@nc9/berth-sdk";
import type {
  ModalClientLike,
  ModalCreateParams,
  ModalProcessLike,
  ModalSandboxLike,
} from "./client.ts";

export const MODAL_PROVIDER_ID = "modal";

/**
 * What this adapter can do. Not yet cross-checked against the catalog: the
 * catalog has no Modal record at the time of writing. Fields Modal does not
 * document are left out rather than guessed (no domainMax / cidrMax).
 */
export const MODAL_INFO = {
  id: MODAL_PROVIDER_ID,
  isolation: "gvisor",
  createFrom: ["image"],
  exec: { detached: true, logsByOffset: true, streaming: false, tty: false },
  files: true,
  network: {
    egressPolicy: ["none", "open", "allowlist"],
    mutuallyExclusive: false,
    ingress: true,
  },
  resources: { vcpu: true, memory: true, disk: false, gpu: true },
  ttl: true,
  labels: true,
  list: true,
  listByLabel: true,
  os: ["linux"],
  arch: ["x86_64"],
  pause: false,
  snapshot: false,
} as const satisfies ProviderInfo;

export type ModalInfo = typeof MODAL_INFO;

/** Modal's `cpu` is in physical cores; one core is 2 vCPU. */
const VCPU_PER_CORE = 2;

/**
 * Modal's SDK has no resource or egress readback, so the adapter records
 * what it requested in reserved tags. describe() returns that echo. It is
 * NOT Modal's own report: consumers needing verification must check
 * out-of-band (see README).
 */
const RESERVED = "berth.modal/";
const T = {
  vcpu: `${RESERVED}vcpu`,
  mem: `${RESERVED}memory-mib`,
  gpu: `${RESERVED}gpu`,
  region: `${RESERVED}region`,
  policy: `${RESERVED}egress`,
  domains: `${RESERVED}egress-domains`,
  cidrs: `${RESERVED}egress-cidrs`,
} as const;

export interface ModalProviderOptions {
  /** Both come from the consumer; never read from env by this adapter. */
  tokenId: string;
  tokenSecret: string;
  /** Modal App that owns the sandboxes. Default "berth". */
  appName?: string;
  environment?: string;
  /** Test seam: a stand-in for the Modal SDK client. */
  client?: ModalClientLike;
}

interface ExecRecord {
  buffer: string;
  exitCode?: number;
  done: boolean;
  failed: boolean;
}

const noopLogger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

export function createModalProvider(
  options: ModalProviderOptions,
): Provider<ModalInfo> {
  const { tokenId, tokenSecret } = options;
  if (!tokenId || !tokenSecret) {
    throw new BerthError("modal: tokenId and tokenSecret are required");
  }
  const appName = options.appName ?? "berth";
  const secrets = [tokenId, tokenSecret];

  const redact = (text: string): string => {
    let out = text;
    for (const s of secrets) out = out.split(s).join("[redacted]");
    return out;
  };
  /** Never forward the SDK error itself: its message or cause may carry credentials. */
  const wrap = (action: string, e: unknown): Error => {
    if (e instanceof BerthError) return e;
    const msg = e instanceof Error ? e.message : String(e);
    return new ProviderError(
      MODAL_PROVIDER_ID,
      redact(`modal ${action} failed: ${msg}`),
    );
  };
  const call = async <T>(action: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      throw wrap(action, e);
    }
  };

  let client: ModalClientLike | undefined = options.client;
  const getClient = (): ModalClientLike => {
    client ??= new ModalClient({
      tokenId,
      tokenSecret,
      ...(options.environment && { environment: options.environment }),
      logger: noopLogger,
    }) as unknown as ModalClientLike;
    return client;
  };
  let appPromise: Promise<{ appId: string }> | undefined;
  const getApp = () => {
    appPromise ??= getClient()
      .apps.fromName(appName, { createIfMissing: true })
      .catch((e) => {
        appPromise = undefined;
        throw e;
      });
    return appPromise;
  };

  /** Resolves a sandbox that is still alive; terminated or missing is NotFoundError. */
  const getSandbox = async (id: string): Promise<ModalSandboxLike> => {
    let sb: ModalSandboxLike;
    try {
      sb = await getClient().sandboxes.fromId(id);
    } catch (e) {
      if (e instanceof ModalNotFoundError) {
        throw new NotFoundError(`sandbox ${id} not found`);
      }
      throw wrap("lookup", e);
    }
    const exit = await call("poll", () => sb.poll());
    if (exit !== null) throw new NotFoundError(`sandbox ${id} has terminated`);
    return sb;
  };

  const execs = new Map<string, ExecRecord>();
  let execCounter = 0;

  const splitTags = (tags: Record<string, string>) => {
    const labels: Labels = {};
    const meta: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags)) {
      if (k.startsWith(RESERVED)) meta[k] = v;
      else labels[k] = v;
    }
    return { labels, meta };
  };

  const csv = (v: string | undefined) => (v ? v.split(",") : undefined);

  const provider = {
    info: MODAL_INFO,

    async healthcheck() {
      try {
        // A fresh call each time: a cached App would hide an outage.
        await getClient().apps.fromName(appName, { createIfMissing: true });
        return { ok: true };
      } catch (e) {
        return { ok: false, detail: wrap("healthcheck", e).message };
      }
    },

    async create(spec: SandboxSpec): Promise<SandboxHandle> {
      // Everything that can be refused is refused before anything is created.
      const verdict = canApply(MODAL_INFO, spec.egress);
      if (!verdict.ok) throw new UnsupportedError(verdict.reason);
      if (!("image" in spec.source)) {
        throw new UnsupportedError("modal can only create from an image");
      }
      if (spec.resources?.diskGiB !== undefined) {
        throw new UnsupportedError("modal does not support a disk size");
      }
      const imageTag = spec.source.image;
      const egress = mapEgress(spec.egress);
      const reserved =
        spec.labels &&
        Object.keys(spec.labels).find((k) => k.startsWith(RESERVED));
      if (reserved)
        throw new UnsupportedError(`label prefix "${RESERVED}" is reserved`);

      const params: ModalCreateParams = { ...egress };
      const tags: Record<string, string> = { ...spec.labels };
      const r = spec.resources;
      if (r?.vcpu !== undefined) {
        params.cpu = r.vcpu / VCPU_PER_CORE;
        tags[T.vcpu] = String(r.vcpu);
      }
      if (r?.memoryMiB !== undefined) {
        params.memoryMiB = r.memoryMiB;
        tags[T.mem] = String(r.memoryMiB);
      }
      if (r?.gpu) {
        params.gpu =
          r.gpu.count > 1 ? `${r.gpu.type}:${r.gpu.count}` : r.gpu.type;
        tags[T.gpu] = params.gpu;
      }
      if (spec.ttlSec !== undefined) params.timeoutMs = spec.ttlSec * 1000;
      if (spec.region) {
        params.regions = [spec.region];
        tags[T.region] = spec.region;
      }
      tags[T.policy] = spec.egress.policy;
      if (spec.egress.domains?.length)
        tags[T.domains] = spec.egress.domains.join(",");
      if (spec.egress.cidrs?.length)
        tags[T.cidrs] = spec.egress.cidrs.join(",");
      params.tags = tags;

      return call("create", async () => {
        const c = getClient();
        const app = await getApp();
        const image = c.images.fromRegistry(imageTag);
        const sb = await c.sandboxes.create(app, image, params);
        return { id: sb.sandboxId, providerId: MODAL_PROVIDER_ID };
      });
    },

    async describe(id: string): Promise<SandboxDescription> {
      const sb = await getSandbox(id);
      const { labels, meta } = splitTags(
        await call("describe", () => sb.getTags()),
      );
      const resources: SandboxResources = {};
      if (meta[T.vcpu]) resources.vcpu = Number(meta[T.vcpu]);
      if (meta[T.mem]) resources.memoryMiB = Number(meta[T.mem]);
      const gpu = meta[T.gpu];
      if (gpu) {
        const [type = gpu, n] = gpu.split(":");
        resources.gpu = { type, count: n ? Number(n) : 1 };
      }
      const egress: EgressSpec = {
        policy: (meta[T.policy] as EgressSpec["policy"] | undefined) ?? "open",
      };
      const domains = csv(meta[T.domains]);
      const cidrs = csv(meta[T.cidrs]);
      if (domains) egress.domains = domains;
      if (cidrs) egress.cidrs = cidrs;
      const out: SandboxDescription = {
        id,
        labels,
        resources,
        egress,
        state: "running" as SandboxState,
      };
      if (meta[T.region]) out.region = meta[T.region];
      return out;
    },

    async destroy(id: string): Promise<void> {
      let sb: ModalSandboxLike;
      try {
        sb = await getClient().sandboxes.fromId(id);
      } catch (e) {
        if (e instanceof ModalNotFoundError) return;
        throw wrap("destroy", e);
      }
      try {
        await sb.terminate();
      } catch (e) {
        if (e instanceof ModalNotFoundError) return;
        throw wrap("destroy", e);
      }
    },

    async list(filter?: { labels?: Labels }): Promise<SandboxSummary[]> {
      return call("list", async () => {
        const app = await getApp();
        const out: SandboxSummary[] = [];
        const tags = filter?.labels;
        for await (const sb of getClient().sandboxes.list({
          appId: app.appId,
          ...(tags && Object.keys(tags).length > 0 && { tags }),
        })) {
          const { labels } = splitTags(await sb.getTags());
          out.push({ id: sb.sandboxId, labels, state: "running" });
        }
        return out;
      });
    },

    async destroyByLabels(labels: Labels): Promise<number> {
      if (Object.keys(labels).length === 0) {
        throw new BerthError("destroyByLabels needs at least one label");
      }
      const found = await provider.list({ labels });
      let n = 0;
      for (const s of found) {
        await provider.destroy(s.id);
        n++;
      }
      return n;
    },

    exec: {
      async start(id: string, o: ExecStartOptions) {
        const sb = await getSandbox(id);
        const proc = await call("exec", () =>
          sb.exec(o.command, {
            mode: "text",
            ...(o.cwd && { workdir: o.cwd }),
            ...(o.env && { env: o.env }),
            ...(o.timeoutSec !== undefined && {
              timeoutMs: o.timeoutSec * 1000,
            }),
          }),
        );
        const execId = `x${++execCounter}-${id}`;
        const rec: ExecRecord = { buffer: "", done: false, failed: false };
        execs.set(execId, rec);
        void pump(proc, rec);
        return { execId };
      },

      async status(_id: string, execId: string): Promise<ExecStatus> {
        const rec = execs.get(execId);
        if (!rec) return { state: "unknown" };
        if (!rec.done) return { state: "running" };
        if (rec.failed) return { state: "unknown" };
        return {
          state: "exited",
          ...(rec.exitCode !== undefined && { exitCode: rec.exitCode }),
        };
      },

      async logs(
        _id: string,
        execId: string,
        offset: number,
      ): Promise<ExecLogs> {
        const rec = execs.get(execId);
        if (!rec) throw new NotFoundError(`exec ${execId} not found`);
        const data = rec.buffer.slice(offset);
        return { data, nextOffset: offset + data.length };
      },
    },

    files: {
      async upload(id: string, path: string, data: Uint8Array) {
        const sb = await getSandbox(id);
        // The SDK has no write call; pipe the bytes through `cat` over stdin.
        await call("upload", async () => {
          const proc = await sb.exec(["sh", "-c", 'cat > "$1"', "sh", path], {
            mode: "binary",
          });
          const w = proc.stdin.getWriter();
          await w.write(data);
          await w.close();
          const code = await proc.wait();
          if (code !== 0) throw new Error(`upload exited with code ${code}`);
        });
      },
      async download(id: string, path: string) {
        const sb = await getSandbox(id);
        return call("download", () => sb.filesystem.readBytes(path));
      },
    },
  };

  return provider as unknown as Provider<ModalInfo>;
}

function mapEgress(e: EgressSpec): ModalCreateParams {
  switch (e.policy) {
    case "none":
      return { blockNetwork: true };
    case "open":
      return {};
    case "allowlist": {
      // An empty allowlist would mean "allow everything" on Modal: refuse.
      if (!e.domains?.length && !e.cidrs?.length) {
        throw new UnsupportedError(
          "allowlist needs at least one domain or CIDR",
        );
      }
      return {
        ...(e.domains?.length && { outboundDomainAllowlist: e.domains }),
        ...(e.cidrs?.length && { outboundCidrAllowlist: e.cidrs }),
      };
    }
    default:
      throw new UnsupportedError(
        `egress policy "${e.policy}" is not supported`,
      );
  }
}

/** Collects stdout and stderr into one buffer so logs can be read by offset. */
async function pump(proc: ModalProcessLike, rec: ExecRecord): Promise<void> {
  const drain = async (s: ModalProcessLike["stdout"]) => {
    const reader = s.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) rec.buffer += value;
    }
  };
  try {
    const [code] = await Promise.all([
      proc.wait(),
      drain(proc.stdout),
      drain(proc.stderr),
    ]);
    rec.exitCode = code;
  } catch {
    rec.failed = true;
  } finally {
    rec.done = true;
  }
}
