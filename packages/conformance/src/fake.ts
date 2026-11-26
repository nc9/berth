import {
  canApply,
  NotFoundError,
  UnsupportedError,
  type ExecStartOptions,
  type Labels,
  type Provider,
  type ProviderInfo,
  type SandboxDescription,
  type SandboxSpec,
  type SandboxState,
} from "@nc9/berth-sdk";

/** Default info for the fake: everything optional is off. */
export const FAKE_INFO: ProviderInfo = {
  id: "fake",
  isolation: "container",
  createFrom: ["image", "snapshot"],
  exec: { detached: true, logsByOffset: true, streaming: false, tty: false },
  files: true,
  network: { egressPolicy: ["none", "open", "allowlist"], ingress: false },
  resources: { vcpu: true, memory: true, disk: true, gpu: false },
  ttl: true,
  labels: true,
  list: true,
  listByLabel: true,
  os: ["linux"],
  arch: ["x86_64"],
  pause: false,
  snapshot: false,
};

export interface FakeOptions {
  /** Overrides merged over FAKE_INFO. `pause` / `snapshot` switch those paths on. */
  info?: Partial<ProviderInfo>;
  /** Max characters returned per logs() call, to force paging. Default 16. */
  logPageSize?: number;
}

interface FakeExec {
  output: string;
  exitCode: number;
}

interface FakeSandbox {
  id: string;
  spec: SandboxSpec;
  state: SandboxState;
  files: Map<string, Uint8Array>;
  execs: Map<string, FakeExec>;
}

/**
 * Tiny command model: `echo ...args` prints its args, `false` exits 1, any
 * other command exits 0 with no output.
 */
function runCommand(command: string[]): FakeExec {
  const [bin, ...args] = command;
  if (bin === "echo") return { output: args.join(" ") + "\n", exitCode: 0 };
  if (bin === "false") return { output: "", exitCode: 1 };
  return { output: "", exitCode: 0 };
}

/** An in-memory provider that passes the conformance suite. */
export function createFakeProvider(options: FakeOptions = {}): Provider {
  const info: ProviderInfo = {
    ...FAKE_INFO,
    ...options.info,
    network: { ...FAKE_INFO.network, ...options.info?.network },
  };
  const pageSize = options.logPageSize ?? 16;
  const boxes = new Map<string, FakeSandbox>();
  const snapshots = new Map<string, SandboxSpec>();
  let seq = 0;

  const get = (id: string): FakeSandbox => {
    const box = boxes.get(id);
    if (!box) throw new NotFoundError(`sandbox ${id} not found`);
    return box;
  };
  const matches = (have: Labels, want: Labels | undefined): boolean =>
    Object.entries(want ?? {}).every(([k, v]) => have[k] === v);

  const provider = {
    info,
    async healthcheck() {
      return { ok: true };
    },
    async create(spec: SandboxSpec) {
      const verdict = canApply(info, spec.egress);
      if (!verdict.ok) throw new UnsupportedError(verdict.reason);
      let source = spec;
      if ("snapshot" in spec.source) {
        const base = snapshots.get(spec.source.snapshot);
        if (!base) throw new NotFoundError("snapshot not found");
        source = { ...spec, resources: spec.resources ?? base.resources };
      }
      const id = `fake-${++seq}`;
      boxes.set(id, {
        id,
        spec: source,
        state: "running",
        files: new Map(),
        execs: new Map(),
      });
      return { id, providerId: info.id };
    },
    async describe(id: string): Promise<SandboxDescription> {
      const box = get(id);
      return {
        id,
        labels: { ...box.spec.labels },
        resources: { ...box.spec.resources },
        egress: { ...box.spec.egress },
        state: box.state,
        ...(box.spec.region !== undefined && { region: box.spec.region }),
      };
    },
    async destroy(id: string) {
      boxes.delete(id);
    },
    async destroyByLabels(labels: Labels) {
      let n = 0;
      for (const box of [...boxes.values()]) {
        if (matches(box.spec.labels, labels)) {
          boxes.delete(box.id);
          n++;
        }
      }
      return n;
    },
    async list(filter?: { labels?: Labels }) {
      return [...boxes.values()]
        .filter((b) => matches(b.spec.labels, filter?.labels))
        .map((b) => ({
          id: b.id,
          labels: { ...b.spec.labels },
          state: b.state,
        }));
    },
    exec: {
      async start(id: string, opts: ExecStartOptions) {
        const box = get(id);
        const execId = `exec-${box.execs.size + 1}`;
        box.execs.set(execId, runCommand(opts.command));
        return { execId };
      },
      async status(id: string, execId: string) {
        const exec = get(id).execs.get(execId);
        if (!exec) return { state: "unknown" as const };
        return { state: "exited" as const, exitCode: exec.exitCode };
      },
      async logs(id: string, execId: string, offset: number) {
        const exec = get(id).execs.get(execId);
        if (!exec) throw new NotFoundError(`exec ${execId} not found`);
        const data = exec.output.slice(offset, offset + pageSize);
        return { data, nextOffset: offset + data.length };
      },
    },
    files: {
      async upload(id: string, path: string, data: Uint8Array) {
        get(id).files.set(path, new Uint8Array(data));
      },
      async download(id: string, path: string) {
        const data = get(id).files.get(path);
        if (!data) throw new NotFoundError(`file ${path} not found`);
        return new Uint8Array(data);
      },
    },
  };

  if (info.pause) {
    Object.assign(provider, {
      async pause(id: string) {
        get(id).state = "paused";
      },
      async resume(id: string) {
        get(id).state = "running";
      },
    });
  }
  if (info.snapshot) {
    Object.assign(provider, {
      async snapshot(id: string) {
        const snapshot = `snap-${++seq}`;
        snapshots.set(snapshot, get(id).spec);
        return { snapshot };
      },
    });
  }
  return provider as unknown as Provider;
}
