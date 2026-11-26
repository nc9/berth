import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BerthError,
  NotFoundError,
  ProviderError,
  UnsupportedError,
  type SandboxSpec,
} from "@nc9/berth-sdk";
import {
  ALL_TRAFFIC,
  buildLauncher,
  completeUtf8End,
  createE2bProvider,
  E2B_INFO,
  mapEgress,
  readEgress,
  redact,
  shellQuote,
  LOG_PAGE_BYTES,
} from "../src/index.ts";
import { connectionOptions, mapError } from "../src/sdk-transport.ts";
import { createMockE2b } from "./mock-transport.ts";

const spec = (over: Partial<SandboxSpec> = {}): SandboxSpec => ({
  source: { template: "base" },
  egress: { policy: "open" },
  labels: { team: "ci" },
  ...over,
});

describe("package", () => {
  test("pins e2b exactly and depends on the workspace sdk", async () => {
    const pkg = await Bun.file(
      new URL("../package.json", import.meta.url),
    ).json();
    expect(pkg.name).toBe("@nc9/berth-e2b");
    expect(pkg.license).toBe("MIT");
    expect(pkg.dependencies["e2b"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies["@nc9/berth-sdk"]).toBe("workspace:*");
  });
  test("info says pause is true and snapshot false", () => {
    expect(E2B_INFO.pause).toBe(true);
    expect(E2B_INFO.snapshot).toBe(false);
  });
});

describe("egress mapping", () => {
  test("open adds no restriction", () => {
    expect(mapEgress(E2B_INFO, { policy: "open" })).toBeUndefined();
  });
  test("none disables internet access", () => {
    expect(mapEgress(E2B_INFO, { policy: "none" })).toEqual({
      allowInternetAccess: false,
    });
  });
  test("allowlist allows entries and denies all traffic", () => {
    expect(
      mapEgress(E2B_INFO, {
        policy: "allowlist",
        domains: ["*.example.com"],
        cidrs: ["10.0.0.0/8"],
      }),
    ).toEqual({
      allowOut: ["*.example.com", "10.0.0.0/8"],
      denyOut: [ALL_TRAFFIC],
    });
  });
  test("empty allowlist is deny-all", () => {
    expect(mapEgress(E2B_INFO, { policy: "allowlist" })).toEqual({
      allowInternetAccess: false,
    });
  });
  test.each(["deny-all-except-proxy", "proxy-domain-filtered"] as const)(
    "%s is refused",
    (policy) => {
      expect(() => mapEgress(E2B_INFO, { policy })).toThrow(UnsupportedError);
    },
  );
  test("malformed entries are refused", () => {
    expect(() =>
      mapEgress(E2B_INFO, { policy: "allowlist", cidrs: ["example.com"] }),
    ).toThrow(UnsupportedError);
    expect(() =>
      mapEgress(E2B_INFO, { policy: "allowlist", domains: ["1.2.3.4"] }),
    ).toThrow(UnsupportedError);
    expect(() =>
      mapEgress(E2B_INFO, { policy: "allowlist", domains: ["*"] }),
    ).toThrow(UnsupportedError);
  });
});

describe("create", () => {
  test("sends template, labels as metadata, ttl, vcpu and egress", async () => {
    const t = createMockE2b();
    const p = createE2bProvider({ apiKey: "k", transport: t });
    await p.create(
      spec({
        source: { template: "tpl" },
        ttlSec: 60,
        resources: { vcpu: 4 },
        egress: { policy: "allowlist", domains: ["a.com"] },
      }),
    );
    expect(t.created).toEqual([
      {
        template: "tpl",
        metadata: { team: "ci" },
        timeoutMs: 60_000,
        cpuCount: 4,
        network: {
          allowOut: ["a.com"],
          denyOut: [ALL_TRAFFIC],
          allowPublicTraffic: false,
        },
      },
    ]);
  });

  test("public sandbox URLs are always disabled", async () => {
    const t = createMockE2b();
    const p = createE2bProvider({ apiKey: "k", transport: t });
    await p.create(spec({ egress: { policy: "open" } }));
    await p.create(spec({ egress: { policy: "none" } }));
    for (const c of t.created)
      expect(c.network?.allowPublicTraffic).toBe(false);
  });

  test("a sandbox that comes back public is destroyed and refused", async () => {
    const t = createMockE2b();
    const create = t.create.bind(t);
    t.create = (o) =>
      create({ ...o, network: { ...o.network, allowPublicTraffic: true } });
    const p = createE2bProvider({ apiKey: "k", transport: t });
    await expect(p.create(spec())).rejects.toThrow(/publicly reachable/);
    expect(t.boxes.size).toBe(0);
  });

  test("refusals happen before any request", async () => {
    const t = createMockE2b();
    const p = createE2bProvider({ apiKey: "k", transport: t });
    const refused: Partial<SandboxSpec>[] = [
      { egress: { policy: "proxy-domain-filtered" } },
      { source: { image: "alpine" } },
      { source: { snapshot: "s" } },
      { resources: { memoryMiB: 512 } },
      { resources: { diskGiB: 10 } },
      { resources: { gpu: { type: "a100", count: 1 } } },
      { region: "eu" },
    ];
    for (const r of refused)
      await expect(p.create(spec(r))).rejects.toBeInstanceOf(UnsupportedError);
    expect(t.created).toEqual([]);
  });

  test("describe reports egress as E2B holds it", async () => {
    const p = createE2bProvider({ apiKey: "k", transport: createMockE2b() });
    const egresses: SandboxSpec["egress"][] = [
      { policy: "open" },
      { policy: "none" },
      { policy: "allowlist", domains: [], cidrs: ["10.0.0.0/8"] },
    ];
    for (const egress of egresses) {
      const { id } = await p.create(spec({ egress }));
      expect((await p.describe(id)).egress).toEqual(egress);
    }
  });

  test("a domain allowlist reports the DNS servers E2B also allows", () => {
    const base = {
      sandboxId: "s",
      metadata: {},
      state: "running",
      cpuCount: 1,
      memoryMB: 1,
    } as const;
    const net = { allowOut: ["a.com"], denyOut: [ALL_TRAFFIC] };
    expect(readEgress({ ...base, network: net })).toEqual({
      policy: "allowlist",
      domains: ["a.com"],
      cidrs: ["8.8.8.8"],
    });
    expect(
      readEgress({ ...base, network: { ...net, dnsServers: ["1.1.1.1"] } }),
    ).toEqual({ policy: "allowlist", domains: ["a.com"], cidrs: ["1.1.1.1"] });
  });

  test("allowInternetAccess false with allowOut is an allowlist, not none", () => {
    const base = {
      sandboxId: "s",
      metadata: {},
      state: "running",
      cpuCount: 1,
      memoryMB: 1,
    } as const;
    expect(
      readEgress({
        ...base,
        allowInternetAccess: false,
        network: { allowOut: ["10.0.0.0/8"] },
      }),
    ).toEqual({ policy: "allowlist", domains: [], cidrs: ["10.0.0.0/8"] });
    expect(readEgress({ ...base, allowInternetAccess: false })).toEqual({
      policy: "none",
    });
  });
});

describe("labels", () => {
  test("destroyByLabels refuses an empty filter", async () => {
    const t = createMockE2b();
    const p = createE2bProvider({ apiKey: "k", transport: t });
    await p.create(spec());
    await expect(p.destroyByLabels({})).rejects.toBeInstanceOf(BerthError);
    expect(t.boxes.size).toBe(1);
  });
});

describe("exec", () => {
  test("env goes to the transport, not argv; ids are validated", async () => {
    const t = createMockE2b();
    const p = createE2bProvider({ apiKey: "k", transport: t });
    const { id } = await p.create(spec());
    await p.exec.start(id, {
      command: ["echo", "x"],
      env: { TOKEN: "s3cret" },
      cwd: "/work",
      timeoutSec: 5,
    });
    const s = t.spawned[0]!;
    expect(s.envs).toEqual({ TOKEN: "s3cret" });
    expect(s.argv).toEqual(["echo", "x"]);
    expect(s.argv.join(" ")).not.toContain("s3cret");
    await expect(p.exec.status(id, "../etc/passwd")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
  test("logs and status read bounded ranges, never whole files", async () => {
    const t = createMockE2b();
    const p = createE2bProvider({ apiKey: "k", transport: t });
    const { id } = await p.create(spec());
    const { execId } = await p.exec.start(id, { command: ["echo", "hello"] });
    const box = t.boxes.get(id)!;
    const big = new Uint8Array(LOG_PAGE_BYTES * 3).fill(97);
    box.files.set(`/tmp/.berth/exec/${execId}.log`, big);
    const page = await p.exec.logs(id, execId, 10);
    expect(page.data.length).toBe(LOG_PAGE_BYTES);
    expect(page.nextOffset).toBe(10 + LOG_PAGE_BYTES);
    await p.exec.status(id, execId);
    expect(t.reads.length).toBe(2);
    for (const r of t.reads)
      expect(r.limit).toBeLessThanOrEqual(LOG_PAGE_BYTES);
  });
  test("unknown exec reports unknown", async () => {
    const p = createE2bProvider({ apiKey: "k", transport: createMockE2b() });
    const { id } = await p.create(spec());
    expect((await p.exec.status(id, "nope")).state).toBe("unknown");
  });
  test("status on a missing sandbox throws NotFoundError", async () => {
    const p = createE2bProvider({ apiKey: "k", transport: createMockE2b() });
    await expect(p.exec.status("sbx-gone", "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
  test("pause then resume round-trips state", async () => {
    const p = createE2bProvider({ apiKey: "k", transport: createMockE2b() });
    const { id } = await p.create(spec());
    await p.pause(id);
    expect((await p.describe(id)).state).toBe("paused");
    await p.resume(id);
    expect((await p.describe(id)).state).toBe("running");
  });
});

describe("launcher", () => {
  test("runs hostile arguments verbatim and records the exit code", async () => {
    const dir = mkdtempSync(join(tmpdir(), "berth-launch-"));
    try {
      const hostile = "$(touch pwned); `touch pwned` it's";
      const logPath = join(dir, "l.log");
      const exitPath = join(dir, "e.exit");
      const script = buildLauncher({
        argv: ["echo", hostile],
        logPath,
        exitPath,
        cwd: dir,
        timeoutSec: 5,
      });
      const proc = Bun.spawn(["sh", "-c", script], { cwd: tmpdir() });
      await proc.exited;
      for (let i = 0; i < 100 && !existsSync(exitPath); i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(readFileSync(logPath, "utf8")).toBe(hostile + "\n");
      expect(readFileSync(exitPath, "utf8").trim()).toBe("0");
      expect(existsSync(join(dir, "pwned"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test("shellQuote escapes single quotes", () => {
    expect(shellQuote("a'b")).toBe("'a'\\''b'");
  });
  test("completeUtf8End never splits a character", () => {
    const bytes = new TextEncoder().encode("aé€😀");
    for (let n = 0; n <= bytes.length; n++) {
      const end = completeUtf8End(bytes.subarray(0, n));
      expect(() =>
        new TextDecoder("utf-8", { fatal: true }).decode(
          bytes.subarray(0, end),
        ),
      ).not.toThrow();
    }
  });
});

describe("credentials", () => {
  const key = "e2b_SUPERSECRETKEY123";
  test("apiKey is required", () => {
    expect(() => createE2bProvider({ apiKey: "" })).toThrow(BerthError);
  });
  test("redact removes every occurrence", () => {
    expect(redact(`a ${key} b ${key}`, key)).toBe("a [redacted] b [redacted]");
  });
  test("transport failures never leak the key", async () => {
    const t = createMockE2b({
      failWith: new Error(`401 for Authorization: ${key}`),
    });
    const p = createE2bProvider({ apiKey: key, transport: t });
    const err = await p.create(spec()).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(String(err.message)).not.toContain(key);
    expect(err.cause).toBeUndefined();
    const hc = await p.healthcheck();
    expect(hc.ok).toBe(false);
    expect(JSON.stringify(hc)).not.toContain(key);
  });
  test("berth errors carrying the key are scrubbed too", async () => {
    const t = createMockE2b();
    t.getInfo = async () => {
      throw new NotFoundError(`gone ${key}`);
    };
    const p = createE2bProvider({ apiKey: key, transport: t });
    const err = await p.describe("x").catch((e) => e);
    expect(String(err.message)).not.toContain(key);
  });
});

describe("sdk transport", () => {
  test("connection options ignore E2B_* environment variables", () => {
    const keys = ["E2B_API_URL", "E2B_DOMAIN", "E2B_SANDBOX_URL", "E2B_DEBUG"];
    const saved = keys.map((k) => process.env[k]);
    for (const k of keys) process.env[k] = "https://attacker.example";
    try {
      expect(connectionOptions({ apiKey: "k" })).toEqual({
        apiKey: "k",
        domain: "e2b.app",
        apiUrl: "https://api.e2b.app",
        sandboxUrl: "https://sandbox.e2b.app",
        debug: false,
      });
    } finally {
      keys.forEach((k, i) =>
        saved[i] === undefined
          ? delete process.env[k]
          : (process.env[k] = saved[i]),
      );
    }
  });
  test("a custom domain needs an explicit sandboxUrl", () => {
    expect(() => connectionOptions({ apiKey: "k", domain: "x.test" })).toThrow(
      UnsupportedError,
    );
    expect(
      connectionOptions({
        apiKey: "k",
        domain: "x.test",
        sandboxUrl: "https://s.x.test",
      }).apiUrl,
    ).toBe("https://api.x.test");
  });
  test("only error names map to NotFoundError, not message text", () => {
    expect(() =>
      mapError(new Error("sh: timeout: not found"), "k"),
    ).not.toThrow(NotFoundError);
    const e = new Error("x");
    e.name = "SandboxNotFoundError";
    expect(() => mapError(e, "k")).toThrow(NotFoundError);
  });
});
