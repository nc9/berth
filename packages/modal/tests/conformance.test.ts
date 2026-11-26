import { test } from "bun:test";
import { runConformance } from "@nc9/berth-conformance";
import { createModalProvider } from "../src/index.ts";
import { FakeModal } from "./fake-modal.ts";

// CI: the suite against the adapter with a mocked Modal SDK client.
runConformance(
  "modal (mocked SDK)",
  () =>
    createModalProvider({
      tokenId: "ak-test-id",
      tokenSecret: "as-test-secret",
      client: new FakeModal(),
    }),
  { timeoutMs: 5_000 },
);

// Live: only with credentials from the test env; skipped otherwise.
const liveId = process.env.BERTH_MODAL_TOKEN_ID;
const liveSecret = process.env.BERTH_MODAL_TOKEN_SECRET;
if (liveId && liveSecret) {
  runConformance(
    "modal (live)",
    () => createModalProvider({ tokenId: liveId, tokenSecret: liveSecret }),
    { timeoutMs: 180_000 },
  );
} else {
  test.skip("modal (live) conformance: set BERTH_MODAL_TOKEN_ID and BERTH_MODAL_TOKEN_SECRET", () => {});
}
