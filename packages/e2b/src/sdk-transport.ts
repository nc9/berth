import { Sandbox, type SandboxInfo } from "e2b";
import {
  BerthError,
  LimitExceededError,
  NotFoundError,
  UnsupportedError,
} from "@nc9/berth-sdk";
import { buildLauncher } from "./launcher.ts";
import type { E2bSandboxInfo, E2bTransport } from "./transport.ts";

export interface SdkTransportOptions {
  apiKey: string;
  domain?: string;
  apiUrl?: string;
}

const toInfo = (i: SandboxInfo): E2bSandboxInfo => ({
  sandboxId: i.sandboxId,
  metadata: i.metadata,
  state: i.state,
  cpuCount: i.cpuCount,
  memoryMB: i.memoryMB,
  ...(i.allowInternetAccess != null && {
    allowInternetAccess: i.allowInternetAccess,
  }),
  ...(i.network && {
    network: {
      ...(i.network.allowOut && { allowOut: i.network.allowOut }),
      ...(i.network.denyOut && { denyOut: i.network.denyOut }),
    },
  }),
});

/** Maps SDK errors to berth errors by name (no instanceof across versions). */
function mapError(err: unknown, secret: string): never {
  if (err instanceof BerthError) throw err;
  const name = err instanceof Error ? err.name : "";
  const raw = err instanceof Error ? err.message : String(err);
  const message = raw.split(secret).join("[redacted]");
  if (/NotFound/.test(name) || /not found/i.test(raw))
    throw new NotFoundError(`e2b: ${message}`);
  if (name === "AuthenticationError")
    throw new BerthError("e2b: authentication failed (check the API key)");
  if (name === "RateLimitError")
    throw new LimitExceededError(`e2b: ${message}`);
  if (name === "InvalidArgumentError")
    throw new UnsupportedError(`e2b: ${message}`);
  throw new Error(message);
}

/** The default transport, backed by the official `e2b` package. */
export function createSdkTransport(o: SdkTransportOptions): E2bTransport {
  const conn = {
    apiKey: o.apiKey,
    ...(o.domain !== undefined && { domain: o.domain }),
    ...(o.apiUrl !== undefined && { apiUrl: o.apiUrl }),
  };
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      return mapError(err, o.apiKey);
    }
  };

  return {
    create: (c) =>
      wrap(async () => {
        const sbx = await Sandbox.create(c.template, {
          ...conn,
          metadata: c.metadata,
          ...(c.timeoutMs !== undefined && { timeoutMs: c.timeoutMs }),
          ...(c.cpuCount !== undefined && { cpuCount: c.cpuCount }),
          ...(c.network?.allowInternetAccess !== undefined && {
            allowInternetAccess: c.network.allowInternetAccess,
          }),
          ...((c.network?.allowOut || c.network?.denyOut) && {
            network: {
              ...(c.network.allowOut && { allowOut: c.network.allowOut }),
              ...(c.network.denyOut && { denyOut: c.network.denyOut }),
            },
          }),
        });
        return { sandboxId: sbx.sandboxId };
      }),

    getInfo: (id) =>
      wrap(async () => toInfo(await Sandbox.getFullInfo(id, conn))),

    list: (metadata) =>
      wrap(async () => {
        const pager = Sandbox.list({
          ...conn,
          query: {
            state: ["running", "paused"],
            ...(Object.keys(metadata).length > 0 && { metadata }),
          },
        });
        const out: E2bSandboxInfo[] = [];
        while (pager.hasNext)
          out.push(...(await pager.nextItems()).map(toInfo));
        return out;
      }),

    kill: (id) =>
      wrap(async () => {
        try {
          return await Sandbox.kill(id, conn);
        } catch (err) {
          if (err instanceof Error && /NotFound/.test(err.name)) return false;
          throw err;
        }
      }),

    pause: (id) =>
      wrap(async () => {
        await Sandbox.pause(id, conn);
      }),

    // Connecting to a paused sandbox resumes it.
    resume: (id) =>
      wrap(async () => {
        await Sandbox.connect(id, conn);
      }),

    spawn: (id, s) =>
      wrap(async () => {
        const sbx = await Sandbox.connect(id, conn);
        await sbx.commands.run(buildLauncher(s), {
          ...(s.envs && { envs: s.envs }),
          timeoutMs: 30_000,
        });
      }),

    readFile: (id, path) =>
      wrap(async () => {
        const sbx = await Sandbox.connect(id, conn);
        return sbx.files.read(path, { format: "bytes" });
      }),

    writeFile: (id, path, data) =>
      wrap(async () => {
        const sbx = await Sandbox.connect(id, conn);
        const buf = data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength,
        ) as ArrayBuffer;
        await sbx.files.write(path, buf);
      }),
  };
}
