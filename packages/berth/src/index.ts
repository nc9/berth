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
export { mergeCatalog } from "./catalog/merge.ts";
export type { MergeOptions } from "./catalog/merge.ts";
export {
  SCHEMA_VERSION,
  catalogSchema,
  providerSchema,
} from "./catalog/schema.ts";
export { providers as builtInProviders } from "./data/index.ts";
