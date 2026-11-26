// These literal types mirror `@nc9/berth-sdk` and must keep identical values.
// A follow-up unifies them; until then change both together.

/** Weakest to strongest. Used by `find({ minIsolation })`. */
export const ISOLATION_CLASSES = [
  "container",
  "gvisor",
  "microvm",
  "linux-vm",
] as const;
export type IsolationClass = (typeof ISOLATION_CLASSES)[number];

export const EGRESS_POLICIES = ["open", "none", "allowlist"] as const;
export type EgressPolicy = (typeof EGRESS_POLICIES)[number];

export const OS_VALUES = ["linux", "windows", "macos"] as const;
export type Os = (typeof OS_VALUES)[number];

export const ARCH_VALUES = ["x86_64", "arm64"] as const;
export type Arch = (typeof ARCH_VALUES)[number];
