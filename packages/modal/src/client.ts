/**
 * The slice of the Modal JS SDK (`modal`, official) this adapter uses. Tests
 * supply a fake with this shape; production wraps a real `ModalClient`.
 */
export interface ModalStreamLike<R> {
  getReader(): { read(): Promise<{ done: boolean; value?: R }> };
}

export interface ModalProcessLike {
  stdin: { getWriter(): ModalWriterLike };
  stdout: ModalStreamLike<string>;
  stderr: ModalStreamLike<string>;
  wait(): Promise<number>;
}

export interface ModalWriterLike {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface ModalExecParams {
  mode?: "text" | "binary";
  workdir?: string;
  timeoutMs?: number;
  env?: Record<string, string>;
}

export interface ModalSandboxLike {
  readonly sandboxId: string;
  getTags(): Promise<Record<string, string>>;
  poll(): Promise<number | null>;
  terminate(): Promise<void>;
  exec(command: string[], params?: ModalExecParams): Promise<ModalProcessLike>;
  filesystem: { readBytes(path: string): Promise<Uint8Array> };
}

export interface ModalCreateParams {
  cpu?: number;
  memoryMiB?: number;
  gpu?: string;
  timeoutMs?: number;
  regions?: string[];
  tags?: Record<string, string>;
  blockNetwork?: boolean;
  outboundCidrAllowlist?: string[];
  outboundDomainAllowlist?: string[];
}

export interface ModalClientLike {
  apps: {
    fromName(
      name: string,
      params?: { createIfMissing?: boolean },
    ): Promise<{ appId: string }>;
  };
  images: { fromRegistry(tag: string): unknown };
  sandboxes: {
    create(
      app: { appId: string },
      image: unknown,
      params?: ModalCreateParams,
    ): Promise<ModalSandboxLike>;
    fromId(id: string): Promise<ModalSandboxLike>;
    list(params?: {
      appId?: string;
      tags?: Record<string, string>;
    }): AsyncIterable<ModalSandboxLike>;
  };
}
