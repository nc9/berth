import type {
  ContainerType,
  Granularity,
  NumberOrRange,
  Rate,
} from "./types.ts";

export interface Usage {
  /** Wall-clock seconds the container ran. */
  seconds: number;
  /** Active CPU time in seconds (already summed over cores). Required for active-cpu billing. */
  cpuSeconds?: number;
  vcpu?: number;
  memoryMiB?: number;
  gpuCount?: number;
  /** Disk usage in GiB-hours. Without it, disk rates are skipped. */
  diskGiBHours?: number;
  region?: string;
}

export interface CostLine {
  dimension: Rate["dimension"];
  rate: Rate;
  quantity: number;
  unit: string;
  multiplier: number;
  usd: number;
}

export interface SkippedRate {
  dimension: Rate["dimension"];
  unit: Rate["unit"];
  reason: string;
}

export interface CostEstimate {
  /** Sum of `breakdown` only. Rates in `skipped` are NOT included. */
  usd: number;
  breakdown: CostLine[];
  /** Every rate that was not included in `usd`, with the reason. */
  skipped: SkippedRate[];
  billing: string;
  /** Oldest verifiedAt among the rates used. */
  verifiedAt: string;
}

const STEP: Record<Granularity, number> = {
  ms: 0.001,
  "10ms": 0.01,
  s: 1,
  min: 60,
};

function roundUp(seconds: number, g: Granularity): number {
  const step = STEP[g];
  return Math.ceil(Math.round((seconds / step) * 1e6) / 1e6) * step;
}

function size(
  label: string,
  spec: NumberOrRange,
  given: number | undefined,
): number {
  if (given !== undefined) {
    if (!(given > 0)) throw new Error(`${label} must be positive`);
    if (typeof spec === "number") {
      if (given !== spec)
        throw new Error(
          `${label} ${given} does not match the fixed size ${spec}`,
        );
    } else if (given < spec.min || given > spec.max)
      throw new Error(`${label} ${given} is outside ${spec.min}-${spec.max}`);
    return given;
  }
  if (typeof spec === "number") return spec;
  throw new Error(
    `${label} is required: this type has a range (${spec.min}-${spec.max})`,
  );
}

export function estimateCost(type: ContainerType, usage: Usage): CostEstimate {
  const price = type.price;
  if (!price) throw new Error(`type ${type.provider}/${type.id} has no price`);
  if (!(usage.seconds >= 0)) throw new Error("usage.seconds must be >= 0");
  if (
    usage.region !== undefined &&
    type.regions.length > 0 &&
    !type.regions.includes(usage.region)
  )
    throw new Error(
      `region "${usage.region}" is not available for ${type.provider}/${type.id}`,
    );

  const mins = price.minimums ?? {};
  let seconds = usage.seconds;
  if (mins.billedMinutes !== undefined)
    seconds = Math.max(seconds, mins.billedMinutes * 60);
  seconds = roundUp(seconds, price.granularity);
  const hours = seconds / 3600;

  const vcpu = Math.max(size("vcpu", type.vcpu, usage.vcpu), mins.vcpu ?? 0);
  const memGiB =
    Math.max(
      size("memoryMiB", type.memoryMiB, usage.memoryMiB),
      mins.memoryMiB ?? 0,
    ) / 1024;
  const gpuCount =
    usage.gpuCount ?? (type.gpu ?? []).reduce((n, g) => n + g.count, 0);

  const activeCpu =
    price.billing === "active-cpu" ||
    price.billing === "active-cpu+provisioned-memory";
  const useVcpu = price.billing !== "memory-only";
  const useMemory = price.billing !== "active-cpu";
  let cpuHours = 0;
  if (activeCpu) {
    if (usage.cpuSeconds === undefined)
      throw new Error(`${price.billing} billing requires usage.cpuSeconds`);
    if (!(usage.cpuSeconds >= 0))
      throw new Error("usage.cpuSeconds must be >= 0");
    cpuHours = roundUp(usage.cpuSeconds, price.granularity) / 3600;
  }

  const breakdown: CostLine[] = [];
  const skipped: SkippedRate[] = [];
  for (const rate of price.rates) {
    let quantity: number;
    let unit: string;
    const skip = (reason: string) =>
      skipped.push({ dimension: rate.dimension, unit: rate.unit, reason });
    if (rate.dimension === "vcpu" && rate.unit === "per-vcpu-hour") {
      if (!useVcpu) {
        skip(`${price.billing} billing does not charge vcpu`);
        continue;
      }
      quantity = activeCpu ? cpuHours : vcpu * hours;
      unit = "vcpu-hour";
    } else if (rate.dimension === "memory" && rate.unit === "per-gib-hour") {
      if (!useMemory) {
        skip(`${price.billing} billing does not charge memory`);
        continue;
      }
      quantity = memGiB * hours;
      unit = "gib-hour";
    } else if (rate.dimension === "gpu" && rate.unit === "per-gpu-hour") {
      if (
        rate.gpuType !== undefined &&
        !(type.gpu ?? []).some((g) => g.type === rate.gpuType)
      ) {
        skip(`type has no ${rate.gpuType} GPU`);
        continue;
      }
      quantity = gpuCount * hours;
      unit = "gpu-hour";
      if (quantity === 0) {
        skip("gpu quantity is 0");
        continue;
      }
    } else if (rate.dimension === "disk" && rate.unit === "per-gib-hour") {
      if (usage.diskGiBHours === undefined) {
        skip("usage.diskGiBHours not given");
        continue;
      }
      if (!(usage.diskGiBHours >= 0))
        throw new Error("usage.diskGiBHours must be >= 0");
      quantity = usage.diskGiBHours;
      unit = "gib-hour";
    } else {
      skip("rate is not modeled by estimateCost");
      continue;
    }
    const multiplier =
      usage.region !== undefined
        ? (rate.regionMultiplier?.[usage.region] ?? 1)
        : 1;
    breakdown.push({
      dimension: rate.dimension,
      rate,
      quantity,
      unit,
      multiplier,
      usd: quantity * rate.usd * multiplier,
    });
  }
  const usd = breakdown.reduce((n, l) => n + l.usd, 0);
  const verifiedAt =
    breakdown.map((l) => l.rate.verifiedAt).sort()[0] ??
    price.rates.map((r) => r.verifiedAt).sort()[0] ??
    "";
  return { usd, breakdown, skipped, billing: price.billing, verifiedAt };
}
