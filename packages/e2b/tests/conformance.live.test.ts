// Live conformance against real E2B. Listed in tests.txt but a no-op without E2B_API_KEY.
// Run: E2B_API_KEY=... bun test packages/e2b/tests/conformance.live.test.ts
import { runConformance } from "@nc9/berth-conformance";
import type { Provider } from "@nc9/berth-sdk";
import { createE2bProvider } from "../src/index.ts";

const apiKey = process.env.E2B_API_KEY;

if (apiKey) {
  // runConformance takes the widest Provider type; ours has pause: true.
  runConformance(
    "e2b (live)",
    () => createE2bProvider({ apiKey }) as unknown as Provider,
    {
      timeoutMs: 120_000,
      baseSpec: { source: { template: "base" } },
    },
  );
} else {
  console.warn("E2B_API_KEY not set: skipping live conformance");
}
