import { expect, test } from "bun:test";
import { pick } from "./fetch-logos.ts";

// Shape recorded from the context.dev brand API for aws and daytona.
const logos = [
  {
    url: "https://cdn.example/a.png",
    type: "icon",
    mode: "has_opaque_background",
    resolution: { width: 64, height: 64 },
  },
  {
    url: "https://cdn.example/b.png",
    type: "icon",
    mode: "has_opaque_background",
    resolution: { width: 256, height: 256 },
  },
  { url: "https://cdn.example/c.svg", type: "logo", mode: "light" },
  { url: "http://cdn.example/d.svg", type: "logo", mode: "dark" },
];

test("selects has_opaque_background icons, largest first", () => {
  expect(pick(logos, "icon", "opaque").map((l) => l.url)).toEqual([
    "https://cdn.example/b.png",
    "https://cdn.example/a.png",
  ]);
});
test("light and dark do not match opaque images", () => {
  expect(pick(logos, "icon", "light")).toEqual([]);
  expect(pick(logos, "logo", "light")).toHaveLength(1);
});
test("rejects non-https urls", () => {
  expect(pick(logos, "logo", "dark")).toEqual([]);
});
