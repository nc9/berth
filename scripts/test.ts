// Runs the explicit test files listed in tests.txt (never a directory).
// Usage: bun scripts/test.ts [--only <substr>] [-- extra bun test args]
import { readFileSync } from "node:fs";

export function parseTestList(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("#"));
}

if (import.meta.main) {
  const root = new URL("..", import.meta.url).pathname;
  const args = process.argv.slice(2);
  let only: string | undefined;
  const extra: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--only") only = args[++i];
    else extra.push(a);
  }
  let files = parseTestList(readFileSync(`${root}tests.txt`, "utf8"));
  if (only !== undefined) files = files.filter((f) => f.includes(only!));
  if (files.length === 0) {
    console.error("no test files selected");
    process.exit(1);
  }
  const proc = Bun.spawn(["bun", "test", ...files, ...extra], {
    cwd: root,
    stdio: ["inherit", "inherit", "inherit"],
  });
  process.exit(await proc.exited);
}
