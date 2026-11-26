import { expect, test } from "bun:test";
import type { Provider, ProviderInfo } from "../src/index.ts";

const baseInfo = {
  id: "fake",
  isolation: "container",
  createFrom: ["image"],
  exec: { detached: true, logsByOffset: true, streaming: false, tty: false },
  files: true,
  network: { egressPolicy: ["open"], ingress: false },
  resources: { vcpu: true, memory: true, disk: false, gpu: false },
  ttl: false,
  labels: true,
  list: true,
  listByLabel: true,
  os: ["linux"],
  arch: ["x86_64"],
  readback: { resources: "provider", egress: "provider" },
} as const;

const common = {
  async healthcheck() {
    return { ok: true };
  },
  async create() {
    return { id: "1", providerId: "fake" };
  },
  async describe(id: string) {
    return {
      id,
      labels: {},
      resources: {},
      egress: { policy: "open" as const },
      state: "running" as const,
    };
  },
  async destroy() {},
  async destroyByLabels() {
    return 0;
  },
  async list() {
    return [];
  },
  exec: {
    async start() {
      return { execId: "e" };
    },
    async status() {
      return { state: "exited" as const, exitCode: 0 };
    },
    async logs() {
      return { data: "", nextOffset: 0 };
    },
  },
  files: {
    async upload() {},
    async download() {
      return new Uint8Array();
    },
  },
};

test("provider without pause/snapshot", async () => {
  const info = { ...baseInfo, pause: false, snapshot: false } as const;
  const p: Provider<typeof info> = { ...common, info };
  expect((await p.describe("1")).state).toBe("running");
});

test("provider with pause/snapshot", async () => {
  const info = { ...baseInfo, pause: true, snapshot: true } as const;
  const p: Provider<typeof info> = {
    ...common,
    info,
    async pause() {},
    async resume() {},
    async snapshot() {
      return { snapshot: "s" };
    },
  };
  await p.pause("1");
  expect((await p.snapshot("1")).snapshot).toBe("s");
});

test("pause is rejected when the flag is false", () => {
  const info = { ...baseInfo, pause: false, snapshot: false } as const;
  const p: Provider<typeof info> = {
    ...common,
    info,
    // @ts-expect-error pause must not exist when info.pause is false
    pause: async () => {},
    // @ts-expect-error resume must not exist when info.pause is false
    resume: async () => {},
  };
  expect(p).toBeDefined();
});

test("generic ProviderInfo is assignable", () => {
  const f = (_p: Provider<ProviderInfo>) => {};
  expect(f).toBeDefined();
});

test("readback none: describe may omit egress and carry a requested echo", async () => {
  const info = {
    ...baseInfo,
    pause: false,
    snapshot: false,
    readback: { resources: "none", egress: "none" },
  } as const;
  const p: Provider<typeof info> = {
    ...common,
    info,
    async describe(id: string) {
      return {
        id,
        labels: {},
        resources: {},
        requested: { egress: { policy: "none" } },
        state: "running",
      };
    },
  };
  const d = await p.describe("1");
  expect(p.info.readback.egress).toBe("none");
  expect(d.egress).toBeUndefined();
  expect(d.requested?.egress?.policy).toBe("none");
});
