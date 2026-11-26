import { describe, expect, test } from "bun:test";
import {
  BerthError,
  NotFoundError,
  ProviderError,
  UnsupportedError,
  type SandboxSpec,
} from "@nc9/berth-sdk";
import { createModalProvider, MODAL_INFO } from "../src/index.ts";
import { FakeModal } from "./fake-modal.ts";

const ID = "ak-SECRETID-123";
const SECRET = "as-SECRETVALUE-456";

function setup() {
  const modal = new FakeModal();
  const p = createModalProvider({
    tokenId: ID,
    tokenSecret: SECRET,
    client: modal,
  });
  return { modal, p };
}
const spec = (over: Partial<SandboxSpec> = {}): SandboxSpec => ({
  source: { image: "alpine:3" },
  egress: { policy: "open" },
  labels: { team: "ci" },
  ...over,
});

describe("create mapping", () => {
  test("maps image, cpu (vcpu / 2), memory, gpu, timeout, region and tags", async () => {
    const { modal, p } = setup();
    await p.create(
      spec({
        resources: {
          vcpu: 4,
          memoryMiB: 2048,
          gpu: { type: "A100", count: 2 },
        },
        ttlSec: 600,
        region: "us-east-1",
      }),
    );
    const c = modal.createCalls[0]!;
    expect(modal.imageTags).toEqual(["alpine:3"]);
    expect(c.cpu).toBe(2);
    expect(c.memoryMiB).toBe(2048);
    expect(c.gpu).toBe("A100:2");
    expect(c.timeoutMs).toBe(600_000);
    expect(c.regions).toEqual(["us-east-1"]);
    expect(c.tags?.team).toBe("ci");
  });

  test("a single GPU is passed without a count", async () => {
    const { modal, p } = setup();
    await p.create(spec({ resources: { gpu: { type: "T4", count: 1 } } }));
    expect(modal.createCalls[0]!.gpu).toBe("T4");
  });

  test("describe reads back labels without reserved tags", async () => {
    const { p } = setup();
    const { id } = await p.create(
      spec({ resources: { vcpu: 2, memoryMiB: 1024 }, region: "us-east-1" }),
    );
    const d = await p.describe(id);
    expect(d.labels).toEqual({ team: "ci" });
    expect(d.resources).toEqual({ vcpu: 2, memoryMiB: 1024 });
    expect(d.region).toBe("us-east-1");
    expect(d.egress).toEqual({ policy: "open" });
  });

  test("refuses sources, disk and reserved labels Modal cannot honour", async () => {
    const { modal, p } = setup();
    const bad: Partial<SandboxSpec>[] = [
      { source: { snapshot: "s" } },
      { source: { template: "t" } },
      { resources: { diskGiB: 10 } },
      { labels: { "berth.modal/vcpu": "9" } },
    ];
    for (const b of bad) {
      await expect(p.create(spec(b))).rejects.toBeInstanceOf(UnsupportedError);
    }
    expect(modal.createCalls).toEqual([]);
  });
});

describe("egress", () => {
  test("none maps to blockNetwork", async () => {
    const { modal, p } = setup();
    await p.create(spec({ egress: { policy: "none" } }));
    expect(modal.createCalls[0]!.blockNetwork).toBe(true);
  });

  test("allowlist maps domains and CIDRs together, and describe echoes them", async () => {
    const { modal, p } = setup();
    const { id } = await p.create(
      spec({
        egress: {
          policy: "allowlist",
          domains: ["*.example.com"],
          cidrs: ["10.0.0.0/8"],
        },
      }),
    );
    const c = modal.createCalls[0]!;
    expect(c.outboundDomainAllowlist).toEqual(["*.example.com"]);
    expect(c.outboundCidrAllowlist).toEqual(["10.0.0.0/8"]);
    expect(c.blockNetwork).toBeUndefined();
    expect((await p.describe(id)).egress).toEqual({
      policy: "allowlist",
      domains: ["*.example.com"],
      cidrs: ["10.0.0.0/8"],
    });
  });

  test("policies Modal cannot enforce are refused before anything is created", async () => {
    const { modal, p } = setup();
    for (const egress of [
      { policy: "deny-all-except-proxy" as const },
      { policy: "proxy-domain-filtered" as const },
      { policy: "allowlist" as const }, // empty allowlist would allow everything
    ]) {
      await expect(p.create(spec({ egress }))).rejects.toBeInstanceOf(
        UnsupportedError,
      );
    }
    expect(modal.createCalls).toEqual([]);
  });

  test("info.network reports only what the adapter enforces", () => {
    expect(MODAL_INFO.network.egressPolicy).toEqual([
      "none",
      "open",
      "allowlist",
    ]);
    expect(MODAL_INFO.network.mutuallyExclusive).toBe(false);
  });
});

describe("exec, files, lifecycle", () => {
  test("exec passes env and cwd via params, never argv", async () => {
    const { modal, p } = setup();
    const { id } = await p.create(spec());
    await p.exec.start(id, {
      command: ["echo", "hi"],
      env: { TOKEN: "v" },
      cwd: "/work",
      timeoutSec: 5,
    });
    const params = modal.sandboxList.get(id)!.lastExecParams!;
    expect(params).toMatchObject({
      env: { TOKEN: "v" },
      workdir: "/work",
      timeoutMs: 5000,
    });
  });

  test("status of an unknown exec is unknown", async () => {
    const { p } = setup();
    expect(await p.exec.status("x", "nope")).toEqual({ state: "unknown" });
  });

  test("destroy is idempotent for unknown and terminated sandboxes", async () => {
    const { p } = setup();
    await p.destroy("sb-missing");
    const { id } = await p.create(spec());
    await p.destroy(id);
    await p.destroy(id);
    await expect(p.describe(id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("destroyByLabels refuses an empty label set", async () => {
    const { p } = setup();
    await expect(p.destroyByLabels({})).rejects.toBeInstanceOf(BerthError);
  });

  test("list returns labels only, filtered by tags", async () => {
    const { p } = setup();
    const a = await p.create(
      spec({ labels: { g: "a" }, resources: { vcpu: 1 } }),
    );
    await p.create(spec({ labels: { g: "b" } }));
    const found = await p.list({ labels: { g: "a" } });
    expect(found).toEqual([{ id: a.id, labels: { g: "a" }, state: "running" }]);
  });
});

describe("credential leak check", () => {
  test("constructor requires both credentials, without echoing them", () => {
    let err: unknown;
    try {
      createModalProvider({ tokenId: ID, tokenSecret: "" });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BerthError);
    expect(String((err as Error).message)).not.toContain(ID);
  });

  test("errors from the SDK are wrapped and redacted, with no cause", async () => {
    const { modal, p } = setup();
    const { id } = await p.create(spec());
    modal.failWith = `auth failed for ${ID} using ${SECRET}`;
    const failures: unknown[] = [];
    const attempts = [
      () => p.create(spec()),
      () => p.describe(id),
      () => p.destroy(id),
      () => p.list(),
      () => p.exec.start(id, { command: ["true"] }),
      () => p.files.download(id, "/x"),
    ];
    for (const run of attempts) {
      await run().catch((e) => failures.push(e));
    }
    expect(failures).toHaveLength(attempts.length);
    for (const e of failures) {
      expect(e).toBeInstanceOf(ProviderError);
      const text = JSON.stringify(e, Object.getOwnPropertyNames(e as object));
      expect(text).not.toContain(ID);
      expect(text).not.toContain(SECRET);
      expect((e as Error).cause).toBeUndefined();
    }
    const hc = await p.healthcheck();
    expect(hc.ok).toBe(false);
    expect(JSON.stringify(hc)).not.toContain(SECRET);
  });

  test("nothing is written to the console", async () => {
    const seen: string[] = [];
    const orig = { log: console.log, warn: console.warn, error: console.error };
    for (const k of ["log", "warn", "error"] as const)
      console[k] = (...a: unknown[]) => void seen.push(a.join(" "));
    try {
      const { modal, p } = setup();
      const { id } = await p.create(spec());
      modal.failWith = `bad ${SECRET}`;
      await p.describe(id).catch(() => {});
    } finally {
      Object.assign(console, orig);
    }
    expect(seen.join("\n")).not.toContain(SECRET);
  });
});
