import { createCatalog } from "./catalog/catalog.ts";
import { providers } from "./data/index.ts";

export const catalog = createCatalog(providers);

export { createCatalog } from "./catalog/catalog.ts";
export type { Catalog, Filter } from "./catalog/catalog.ts";
export { estimateCost } from "./catalog/cost.ts";
export type { CostEstimate, CostLine, Usage } from "./catalog/cost.ts";
export { GPU_TYPES } from "./catalog/gpus.ts";
export type { GpuType } from "./catalog/gpus.ts";
export * from "./catalog/primitives.ts";
export * from "./catalog/types.ts";
export {
  validateContainerType,
  validateProvider,
  validateProviders,
} from "./catalog/validate.ts";
