/**
 * Conformance suite for berth providers. Ported in spirit from Turntable's
 * packages/provider-conformance (MIT, github.com/turntable-ci/turntable).
 */
import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  canApply,
  NotFoundError,
  UnsupportedError,
  type EgressPolicy,
  type EgressSpec,
  type Provider,
  type ProviderInfo,
  type ProviderPause,
  type ProviderSnapshot,
  type SandboxSpec,
} from "@nc9/berth-sdk";

export type ConformanceCategory =
  | "create"
  | "exec"
  | "files"
  | "destroy"
  | "labels"
  | "pause"
  | "snapshot"
  | "egress";

export interface ConformanceOptions {
  /** Categories to skip, e.g. ones the provider declares unsupported. */
  skip?: readonly ConformanceCategory[];
  /** Default per-test timeout in ms. Default 60000. */
  timeoutMs?: number;
  /** Per-category timeout overrides in ms. */
  timeouts?: Partial<Record<ConformanceCategory, number>>;
  /** Base spec for created sandboxes (source, region, resources). Default `{ image: "alpine:3" }`. */
  baseSpec?: Partial<
    Pick<SandboxSpec, "source" | "region" | "resources" | "ttlSec">
  >;
  /** How long to poll for an exec to exit, in ms. Default 30000. */
  execWaitMs?: number;
}

const ALL_POLICIES: readonly EgressPolicy[] = [
  "none",
  "open",
  "allowlist",
  "deny-all-except-proxy",
  "proxy-domain-filtered",
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const encode = (s: string) => new TextEncoder().encode(s);

/**
 * Registers bun:test tests for a provider. `makeProvider` is called once,
 * synchronously, and must not touch the network (it only reads `info` to
 * decide which tests to register). Each test cleans up what it creates.
 */
export function runConformance(
  name: string,
  makeProvider: () => Provider,
  opts: ConformanceOptions = {},
): void {
  const provider = makeProvider();
  const info: ProviderInfo = provider.info;
  const skip = new Set(opts.skip ?? []);
  const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const timeout = (c: ConformanceCategory) =>
    opts.timeouts?.[c] ?? opts.timeoutMs ?? 60_000;
  const execWaitMs = opts.execWaitMs ?? 30_000;
  let counter = 0;

  /** Every sandbox this suite makes carries this label, so cleanup can sweep. */
  const suiteLabel = { "berth.conformance": runId };
  const newSpec = (over: Partial<SandboxSpec> = {}): SandboxSpec => ({
    source: { image: "alpine:3" },
    ...opts.baseSpec,
    egress: info.network.egressPolicy.includes("open")
      ? { policy: "open" }
      : { policy: info.network.egressPolicy[0] ?? "none" },
    labels: { ...suiteLabel, "berth.case": `c${++counter}` },
    ...over,
  });

  const created: string[] = [];
  const make = async (over?: Partial<SandboxSpec>) => {
    const handle = await provider.create(newSpec(over));
    created.push(handle.id);
    return handle;
  };

  /** Registers a test only when its category is not skipped. */
  const t = (
    category: ConformanceCategory,
    title: string,
    fn: () => Promise<void>,
    enabled = true,
  ) => {
    if (skip.has(category) || !enabled) test.skip(title, fn);
    else test(title, fn, timeout(category));
  };

  const waitExit = async (id: string, execId: string) => {
    const deadline = Date.now() + execWaitMs;
    for (;;) {
      const status = await provider.exec.status(id, execId);
      if (status.state !== "running") return status;
      if (Date.now() > deadline) throw new Error("exec did not exit in time");
      await sleep(100);
    }
  };

  describe(`conformance: ${name}`, () => {
    t(
      "create",
      "create then describe reports the requested labels and resources",
      async () => {
        const resources = {
          ...(info.resources.vcpu && { vcpu: 1 }),
          ...(info.resources.memory && { memoryMiB: 512 }),
        };
        const labels = { ...suiteLabel, "berth.case": "describe", team: "ci" };
        const handle = await make({ labels, resources });
        expect(handle.providerId).toBe(info.id);
        const d = await provider.describe(handle.id);
        expect(d.id).toBe(handle.id);
        if (info.labels) expect(d.labels).toMatchObject(labels);
        if (info.readback.resources === "provider") {
          for (const [k, v] of Object.entries(resources)) {
            expect(d.resources[k as keyof typeof resources]).toBe(v);
          }
        } else {
          // No provider readback: describe must not present an echo as fact.
          expect(d.resources).toEqual({});
        }
        if (info.readback.egress === "none") expect(d.egress).toBeUndefined();
      },
    );

    t("exec", "detached exec reports status and exit code", async () => {
      const { id } = await make();
      const ok = await provider.exec.start(id, { command: ["echo", "hi"] });
      const status = await waitExit(id, ok.execId);
      expect(status.state).toBe("exited");
      expect(status.exitCode).toBe(0);
      const bad = await provider.exec.start(id, { command: ["false"] });
      const badStatus = await waitExit(id, bad.execId);
      expect(badStatus.state).toBe("exited");
      expect(badStatus.exitCode).not.toBe(0);
    });

    t(
      "exec",
      "logs are read by offset with no gaps or duplicates",
      async () => {
        const { id } = await make();
        const text = Array.from({ length: 12 }, (_, i) => `line-${i}`).join(
          " ",
        );
        const { execId } = await provider.exec.start(id, {
          command: ["echo", text],
        });
        await waitExit(id, execId);
        let offset = 0;
        let out = "";
        for (let pages = 0; pages < 10_000; pages++) {
          const page = await provider.exec.logs(id, execId, offset);
          if (page.data === "") {
            expect(page.nextOffset).toBe(offset);
            break;
          }
          expect(page.nextOffset).toBeGreaterThan(offset);
          out += page.data;
          offset = page.nextOffset;
        }
        expect(out.trim()).toBe(text);
        // Re-reading from an earlier offset returns the same bytes: offsets are stable.
        const first = await provider.exec.logs(id, execId, 0);
        expect(out.startsWith(first.data)).toBe(true);
        const again = await provider.exec.logs(id, execId, first.nextOffset);
        expect(out.slice(first.data.length).startsWith(again.data)).toBe(true);
      },
    );

    t(
      "files",
      "upload then download round-trips bytes",
      async () => {
        const { id } = await make();
        const data = new Uint8Array([0, 1, 2, 250, 255, ...encode("héllo")]);
        await provider.files.upload(id, "/tmp/berth-conformance.bin", data);
        const back = await provider.files.download(
          id,
          "/tmp/berth-conformance.bin",
        );
        expect(Array.from(back)).toEqual(Array.from(data));
      },
      info.files,
    );

    t(
      "destroy",
      "destroy is idempotent and describe then throws NotFoundError",
      async () => {
        const { id } = await make();
        await provider.destroy(id);
        await provider.destroy(id);
        await expect(provider.describe(id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
      },
    );

    t(
      "labels",
      "list by label finds only matching sandboxes",
      async () => {
        const a = await make({ labels: { ...suiteLabel, grp: "a" } });
        const b = await make({ labels: { ...suiteLabel, grp: "b" } });
        const onlyA = await provider.list({
          labels: { ...suiteLabel, grp: "a" },
        });
        expect(onlyA.map((s) => s.id)).toEqual([a.id]);
        const both = await provider.list({ labels: suiteLabel });
        expect(both.map((s) => s.id).sort()).toEqual([a.id, b.id].sort());
      },
      info.list && info.listByLabel && info.labels,
    );

    t(
      "labels",
      "destroyByLabels removes only matching sandboxes",
      async () => {
        const a = await make({ labels: { ...suiteLabel, grp: "a" } });
        const b = await make({ labels: { ...suiteLabel, grp: "b" } });
        const n = await provider.destroyByLabels({ ...suiteLabel, grp: "a" });
        expect(n).toBe(1);
        await expect(provider.describe(a.id)).rejects.toBeInstanceOf(
          NotFoundError,
        );
        expect((await provider.describe(b.id)).id).toBe(b.id);
      },
      info.labels,
    );

    t(
      "pause",
      "pause and resume change state and back",
      async () => {
        const p = provider as unknown as ProviderPause;
        const { id } = await make();
        await p.pause(id);
        expect((await provider.describe(id)).state).toBe("paused");
        await p.resume(id);
        expect((await provider.describe(id)).state).toBe("running");
      },
      info.pause,
    );

    t(
      "snapshot",
      "snapshot returns a reference",
      async () => {
        const s = provider as unknown as ProviderSnapshot;
        const { id } = await make();
        const ref = await s.snapshot(id);
        expect(typeof ref.snapshot).toBe("string");
        expect(ref.snapshot).not.toBe("");
        if (info.createFrom.includes("snapshot")) {
          const from = await make({ source: { snapshot: ref.snapshot } });
          expect((await provider.describe(from.id)).id).toBe(from.id);
        }
      },
      info.snapshot,
    );

    const refused = findRefusedEgress(info);
    t(
      "egress",
      "create with an egress policy canApply refuses throws UnsupportedError and creates nothing",
      async () => {
        if (!refused) throw new Error("unreachable");
        expect(canApply(info, refused).ok).toBe(false);
        const labels = { ...suiteLabel, "berth.case": "egress-refused" };
        await expect(
          provider.create(newSpec({ egress: refused, labels })),
        ).rejects.toBeInstanceOf(UnsupportedError);
        if (info.list && info.listByLabel && info.labels) {
          expect(await provider.list({ labels })).toEqual([]);
        }
      },
      refused !== undefined,
    );

    // Each test starts clean; the sweep catches anything a failure left behind.
    afterEach(async () => {
      for (const id of created.splice(0))
        await provider.destroy(id).catch(() => {});
    }, timeout("destroy"));
    afterAll(async () => {
      if (info.labels)
        await provider.destroyByLabels(suiteLabel).catch(() => 0);
    }, timeout("destroy"));
  });
}

/** An egress spec the provider's own `info` says it cannot enforce, if one exists. */
export function findRefusedEgress(info: ProviderInfo): EgressSpec | undefined {
  const unsupported = ALL_POLICIES.find(
    (p) => !info.network.egressPolicy.includes(p),
  );
  if (unsupported) return { policy: unsupported };
  const policy = info.network.egressPolicy[0];
  if (!policy) return undefined;
  const { domainMax, cidrMax, mutuallyExclusive } = info.network;
  const many = (n: number, f: (i: number) => string) =>
    Array.from({ length: n }, (_, i) => f(i));
  if (domainMax !== undefined)
    return { policy, domains: many(domainMax + 1, (i) => `d${i}.example.com`) };
  if (cidrMax !== undefined)
    return { policy, cidrs: many(cidrMax + 1, (i) => `10.0.${i % 256}.0/24`) };
  if (mutuallyExclusive)
    return { policy, domains: ["a.example.com"], cidrs: ["10.0.0.0/24"] };
  return undefined;
}
