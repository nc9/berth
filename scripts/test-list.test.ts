import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseTestList } from "./test.ts";

const root = new URL("..", import.meta.url).pathname;

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    if (name === "node_modules") continue;
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) out.push(...testFiles(rel));
    else if (name.endsWith(".test.ts")) out.push(rel);
  }
  return out;
}

describe("tests.txt", () => {
  test("parses paths, skipping blanks and comments", () => {
    expect(parseTestList("a.test.ts\n\n# c\n  b.test.ts  \n")).toEqual([
      "a.test.ts",
      "b.test.ts",
    ]);
  });

  test("lists every test file, sorted", () => {
    const listed = parseTestList(readFileSync(join(root, "tests.txt"), "utf8"));
    const found = [...testFiles("scripts"), ...testFiles("packages")].sort();
    expect(listed).toEqual([...listed].sort());
    expect(listed).toEqual(found);
  });
});
