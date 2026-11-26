import { NotFoundError } from "@nc9/berth-sdk";
import type {
  E2bCreateOptions,
  E2bSandboxInfo,
  E2bSpawnOptions,
  E2bTransport,
} from "../src/transport.ts";

interface Box {
  info: E2bSandboxInfo;
  files: Map<string, Uint8Array>;
}

export interface MockE2b extends E2bTransport {
  /** Every create request the adapter sent. */
  readonly created: E2bCreateOptions[];
  /** Every spawn request the adapter sent. */
  readonly spawned: E2bSpawnOptions[];
  /** Every bounded read the adapter made. */
  readonly reads: { path: string; offset: number; limit: number }[];
  readonly boxes: Map<string, Box>;
}

const enc = new TextEncoder();

/** Emulates the E2B behaviour the adapter relies on, in memory. */
export function createMockE2b(opts: { failWith?: Error } = {}): MockE2b {
  const boxes = new Map<string, Box>();
  const created: E2bCreateOptions[] = [];
  const spawned: E2bSpawnOptions[] = [];
  const reads: { path: string; offset: number; limit: number }[] = [];
  let seq = 0;
  const guard = () => {
    if (opts.failWith) throw opts.failWith;
  };
  const get = (id: string): Box => {
    const b = boxes.get(id);
    if (!b) throw new NotFoundError(`sandbox ${id} not found`);
    return b;
  };

  return {
    created,
    spawned,
    reads,
    boxes,
    async create(o) {
      guard();
      created.push(o);
      const sandboxId = `sbx-${++seq}`;
      const info: E2bSandboxInfo = {
        sandboxId,
        metadata: { ...o.metadata },
        state: "running",
        cpuCount: o.cpuCount ?? 2,
        memoryMB: 4096,
        ...(o.network?.allowInternetAccess !== undefined && {
          allowInternetAccess: o.network.allowInternetAccess,
        }),
        ...(o.network && {
          network: {
            ...(o.network.allowOut && { allowOut: o.network.allowOut }),
            ...(o.network.denyOut && { denyOut: o.network.denyOut }),
            ...(o.network.allowPublicTraffic !== undefined && {
              allowPublicTraffic: o.network.allowPublicTraffic,
            }),
          },
        }),
      };
      boxes.set(sandboxId, { info, files: new Map() });
      return { sandboxId };
    },
    async getInfo(id) {
      guard();
      return { ...get(id).info };
    },
    async list(metadata) {
      guard();
      return [...boxes.values()]
        .map((b) => b.info)
        .filter((i) =>
          Object.entries(metadata).every(([k, v]) => i.metadata[k] === v),
        );
    },
    async kill(id) {
      guard();
      return boxes.delete(id);
    },
    async pause(id) {
      guard();
      get(id).info.state = "paused";
    },
    async resume(id) {
      guard();
      get(id).info.state = "running";
    },
    async spawn(id, o) {
      guard();
      spawned.push(o);
      const box = get(id);
      // Command model: echo prints its args, false exits 1, anything else exits 0.
      const [bin, ...args] = o.argv;
      const out = bin === "echo" ? args.join(" ") + "\n" : "";
      box.files.set(o.logPath, enc.encode(out));
      box.files.set(o.exitPath, enc.encode(bin === "false" ? "1\n" : "0\n"));
    },
    async readFile(id, path) {
      guard();
      const data = get(id).files.get(path);
      if (!data) throw new NotFoundError(`file ${path} not found`);
      return data;
    },
    async readRange(id, path, offset, limit) {
      guard();
      reads.push({ path, offset, limit });
      const data = get(id).files.get(path);
      if (!data) throw new NotFoundError(`file ${path} not found`);
      return data.subarray(offset, offset + limit);
    },
    async writeFile(id, path, data) {
      guard();
      get(id).files.set(path, data);
    },
  };
}
