# @nc9/berth

Catalog of container and sandbox providers: providers, container types, capabilities and prices. Zero runtime dependencies. Memory is in MiB everywhere.

```ts
import { catalog, createCatalog, type Provider } from "@nc9/berth";

// Built-in data (empty until provider data lands).
catalog.getProviders();

// Custom data: createCatalog validates it and throws listing every error.
const mine = createCatalog([acme satisfies Provider]);

mine.getProvider("acme");
mine.getTypes("acme");
mine.getType("acme", "gpu");

// Filter types.
mine.find({
  os: "linux",
  gpuType: "h100",
  gpuCount: 2,
  minMemoryMiB: 16384,
  region: "us-east",
  minIsolation: "microvm",
  egress: "allowlist",
  status: "ga",
});

// Estimate cost. Range types need vcpu / memoryMiB; active-cpu billing needs cpuSeconds.
const { usd, breakdown, billing, verifiedAt } = mine.estimateCost(type, {
  seconds: 3600,
  vcpu: 2,
  memoryMiB: 4096,
  region: "eu-west",
});
```

Validators: `validateProvider(meta)`, `validateContainerType(type, meta?)` and `validateProviders(list)` return arrays of error strings.

Every price rate carries `verifiedAt`, `sourceUrl` and optionally the vendor's `raw` value and unit. `estimateCost` prices only time-based dimensions (vcpu, memory, gpu); disk, egress, creation and snapshot rates are not included.
