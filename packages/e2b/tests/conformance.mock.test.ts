import { runConformance } from "@nc9/berth-conformance";
import type { Provider } from "@nc9/berth-sdk";
import { createE2bProvider } from "../src/index.ts";
import { createMockE2b } from "./mock-transport.ts";

// runConformance takes the widest Provider type; ours has pause: true.
runConformance(
  "e2b (mock transport)",
  () =>
    createE2bProvider({
      apiKey: "test-key",
      transport: createMockE2b(),
    }) as unknown as Provider,
  {
    timeoutMs: 5_000,
    baseSpec: { source: { template: "base" } },
  },
);
