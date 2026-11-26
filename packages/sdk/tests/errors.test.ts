import { expect, test } from "bun:test";
import {
  BerthError,
  LimitExceededError,
  NotFoundError,
  ProviderError,
  UnsupportedError,
} from "../src/index.ts";

test("error hierarchy", () => {
  for (const e of [
    new NotFoundError("x"),
    new UnsupportedError("x"),
    new LimitExceededError("x"),
  ]) {
    expect(e).toBeInstanceOf(BerthError);
  }
  const p = new ProviderError("daytona", "boom");
  expect(p).toBeInstanceOf(BerthError);
  expect(p.providerId).toBe("daytona");
});
