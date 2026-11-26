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
  redact,
  shellQuote,
} from "../src/index.ts";
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
        network: { allowOut: ["a.com"], denyOut: [ALL_TRAFFIC] },
      },
    ]);
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
      { policy: "allowlist", domains: ["a.com"], cidrs: ["10.0.0.0/8"] },
    ];
    for (const egress of egresses) {
      const { id } = await p.create(spec({ egress }));
      expect((await p.describe(id)).egress).toEqual(egress);
    }
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
  test("unknown exec reports unknown", async () => {
    const p = createE2bProvider({ apiKey: "k", transport: createMockE2b() });
    const { id } = await p.create(spec());
    expect((await p.exec.status(id, "nope")).state).toBe("unknown");
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
