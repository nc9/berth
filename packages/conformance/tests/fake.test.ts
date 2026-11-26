import { expect, test } from "bun:test";
import { NotFoundError, UnsupportedError } from "@nc9/berth-sdk";
import { runConformance } from "../src/suite.ts";
import { createFakeProvider, FAKE_INFO } from "../src/fake.ts";

for (const pause of [false, true]) {
  for (const snapshot of [false, true]) {
    runConformance(
      `fake pause=${pause} snapshot=${snapshot}`,
      () => createFakeProvider({ info: { pause, snapshot } }),
      { timeoutMs: 5_000 },
    );
  }
}

// Fully capable egress: the refused path comes from limits instead.
runConformance(
  "fake with domain limit",
  () =>
    createFakeProvider({
      info: {
        network: {
          egressPolicy: [
            "none",
            "open",
            "allowlist",
            "deny-all-except-proxy",
            "proxy-domain-filtered",
          ],
          domainMax: 2,
          ingress: false,
        },
      },
    }),
  { timeoutMs: 5_000 },
);

test("fake exposes pause/resume/snapshot only when info flags are set", () => {
  const off = createFakeProvider() as unknown as Record<string, unknown>;
  expect(off.pause).toBeUndefined();
  expect(off.resume).toBeUndefined();
  expect(off.snapshot).toBeUndefined();
  const on = createFakeProvider({
    info: { pause: true, snapshot: true },
  }) as unknown as Record<string, unknown>;
  expect(typeof on.pause).toBe("function");
  expect(typeof on.resume).toBe("function");
  expect(typeof on.snapshot).toBe("function");
  expect(FAKE_INFO.pause).toBe(false);
});

test("fake refuses unsupported egress and creates nothing", async () => {
  const p = createFakeProvider();
  await expect(
    p.create({
      source: { image: "x" },
      egress: { policy: "proxy-domain-filtered" },
      labels: { a: "b" },
    }),
  ).rejects.toBeInstanceOf(UnsupportedError);
  expect(await p.list()).toEqual([]);
});

test("fake describe throws NotFoundError for unknown ids", async () => {
  await expect(createFakeProvider().describe("nope")).rejects.toBeInstanceOf(
    NotFoundError,
  );
});
