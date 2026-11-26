import { estimateCost } from "./cost.ts";
import { ISOLATION_CLASSES } from "./primitives.ts";
import type { Arch, EgressPolicy, IsolationClass, Os } from "./primitives.ts";
import type {
  ContainerType,
  NumberOrRange,
  Provider,
  ProviderMeta,
  Status,
} from "./types.ts";
import { validateProviders } from "./validate.ts";

export interface Filter {
  os?: Os;
  arch?: Arch;
  gpuType?: string;
  gpuCount?: number;
  /** The type can offer at least this many vCPU. */
  minVcpu?: number;
  minMemoryMiB?: number;
  region?: string;
  minIsolation?: IsolationClass;
  /** Provider (or type override) capabilities list this egress policy. */
  egress?: EgressPolicy;
  status?: Status;
  provider?: string;
}

const maxOf = (n: NumberOrRange): number => (typeof n === "number" ? n : n.max);

export interface Catalog {
  getProviders(): ProviderMeta[];
  getProvider(id: string): ProviderMeta | undefined;
  getTypes(providerId?: string): ContainerType[];
  getType(providerId: string, typeId: string): ContainerType | undefined;
  find(filter?: Filter): ContainerType[];
  estimateCost: typeof estimateCost;
}

export function createCatalog(providers: Provider[]): Catalog {
  const errors = validateProviders(providers);
  if (errors.length > 0)
    throw new Error(`invalid catalog data:\n- ${errors.join("\n- ")}`);
  const byId = new Map(providers.map((p) => [p.meta.id, p]));

  const getTypes = (providerId?: string): ContainerType[] =>
    providerId === undefined
      ? providers.flatMap((p) => p.types)
      : [...(byId.get(providerId)?.types ?? [])];

  return {
    getProviders: () => providers.map((p) => p.meta),
    getProvider: (id) => byId.get(id)?.meta,
    getTypes,
    getType: (providerId, typeId) =>
      byId.get(providerId)?.types.find((t) => t.id === typeId),
    estimateCost,
    find(f = {}) {
      return providers.flatMap((p) =>
        p.types.filter((t) => {
          if (f.provider !== undefined && p.meta.id !== f.provider)
            return false;
          if (
            f.status !== undefined &&
            (t.status ?? p.meta.status) !== f.status
          )
            return false;
          if (f.os !== undefined && !t.os.includes(f.os)) return false;
          if (f.arch !== undefined && !t.arch.includes(f.arch)) return false;
          if (f.gpuType !== undefined || f.gpuCount !== undefined) {
            const ok = (t.gpu ?? []).some(
              (g) =>
                (f.gpuType === undefined || g.type === f.gpuType) &&
                g.count >= (f.gpuCount ?? 1),
            );
            if (!ok) return false;
          }
          if (f.minVcpu !== undefined && maxOf(t.vcpu) < f.minVcpu)
            return false;
          if (
            f.minMemoryMiB !== undefined &&
            maxOf(t.memoryMiB) < f.minMemoryMiB
          )
            return false;
          if (f.region !== undefined && !t.regions.includes(f.region))
            return false;
          if (
            f.minIsolation !== undefined &&
            ISOLATION_CLASSES.indexOf(t.isolation) <
              ISOLATION_CLASSES.indexOf(f.minIsolation)
          )
            return false;
          if (f.egress !== undefined) {
            const caps = t.capabilities?.egress ?? p.meta.capabilities?.egress;
            if (!caps?.policies.includes(f.egress)) return false;
          }
          return true;
        }),
      );
    },
  };
}
