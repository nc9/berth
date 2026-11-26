/** Canonical GPU ids shared across providers. */
export const GPU_TYPES = [
  "t4",
  "l4",
  "l40s",
  "a10g",
  "a100-40gb",
  "a100-80gb",
  "h100",
  "h200",
  "b200",
  "rtx-4090",
  "rtx-pro-6000",
] as const;
export type GpuType = (typeof GPU_TYPES)[number];
