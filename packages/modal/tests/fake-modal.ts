import { NotFoundError as ModalNotFoundError } from "modal";
import type {
  ModalClientLike,
  ModalCreateParams,
  ModalExecParams,
  ModalProcessLike,
  ModalSandboxLike,
} from "../src/client.ts";

function textStream(chunks: string[]) {
  const queue = [...chunks];
  return {
    getReader: () => ({
      read: async () =>
        queue.length > 0
          ? { done: false, value: queue.shift() }
          : { done: true as const },
    }),
  };
}

/** Runs the tiny command set the conformance suite uses. */
function runFake(
  sb: FakeSandbox,
  command: string[],
  params?: ModalExecParams,
): ModalProcessLike {
  sb.lastExecParams = params;
  let out: string[] = [];
  let code = 0;
  let wait = () => Promise.resolve(code);
  let stdin: ModalProcessLike["stdin"] = {
    getWriter: () => ({ write: async () => {}, close: async () => {} }),
  };
  const [cmd, ...args] = command;
  if (cmd === "echo") out = [args.join(" ") + "\n"];
  else if (cmd === "false") code = 1;
  else if (cmd === "sh" && command[2]?.startsWith("cat >")) {
    const path = command[4] as string;
    const chunks: Uint8Array[] = [];
    let closed!: () => void;
    const done = new Promise<void>((r) => (closed = r));
    stdin = {
      getWriter: () => ({
        write: async (c) => void chunks.push(c),
        close: async () => {
          sb.files.set(path, Buffer.concat(chunks));
          closed();
        },
      }),
    };
    wait = async () => (await done, 0);
  }
  return { stdin, stdout: textStream(out), stderr: textStream([]), wait };
}

export class FakeSandbox implements ModalSandboxLike {
  terminated = false;
  files = new Map<string, Uint8Array>();
  lastExecParams?: ModalExecParams;
  constructor(
    readonly sandboxId: string,
    readonly params: ModalCreateParams,
  ) {}
  async getTags() {
    return { ...this.params.tags };
  }
  async poll() {
    return this.terminated ? 0 : null;
  }
  async terminate() {
    this.terminated = true;
  }
  async exec(command: string[], params?: ModalExecParams) {
    return runFake(this, command, params);
  }
  filesystem = {
    readBytes: async (path: string) => {
      const f = this.files.get(path);
      if (!f) throw new Error("no such file");
      return f;
    },
  };
}

/** An in-memory stand-in for the Modal SDK client. */
export class FakeModal implements ModalClientLike {
  sandboxList = new Map<string, FakeSandbox>();
  createCalls: ModalCreateParams[] = [];
  imageTags: string[] = [];
  /** When set, every call fails with this message. */
  failWith?: string;
  private n = 0;
  private guard() {
    if (this.failWith) throw new Error(this.failWith);
  }
  apps = {
    fromName: async () => {
      this.guard();
      return { appId: "ap-fake" };
    },
  };
  images = {
    fromRegistry: (tag: string) => {
      this.imageTags.push(tag);
      return { tag };
    },
  };
  sandboxes = {
    create: async (
      _app: { appId: string },
      _image: unknown,
      params: ModalCreateParams = {},
    ) => {
      this.guard();
      this.createCalls.push(params);
      const sb = new FakeSandbox(`sb-${++this.n}`, params);
      this.sandboxList.set(sb.sandboxId, sb);
      return sb;
    },
    fromId: async (id: string) => {
      this.guard();
      const sb = this.sandboxList.get(id);
      if (!sb) throw new ModalNotFoundError(`no sandbox ${id}`);
      return sb;
    },
    list: (params?: { tags?: Record<string, string> }) => {
      this.guard();
      const all = [...this.sandboxList.values()].filter(
        (s) =>
          !s.terminated &&
          Object.entries(params?.tags ?? {}).every(
            ([k, v]) => s.params.tags?.[k] === v,
          ),
      );
      return (async function* () {
        yield* all;
      })();
    },
  };
}
