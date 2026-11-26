import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import {
  builtInProviders,
  validateLogoManifest,
  validateProviders,
} from "../src/index.ts";
import type { LogoManifest } from "../src/index.ts";
import { sanitizeSvg } from "../src/catalog/svg-sanitize.ts";

const repo = new URL("../../../", import.meta.url).pathname;
const logos = `${repo}packages/berth/assets/logos`;
const manifest = JSON.parse(
  readFileSync(`${logos}/manifest.json`, "utf8"),
) as LogoManifest;

const ok = (s: string) => {
  const r = sanitizeSvg(s);
  if (!r.ok) throw new Error(r.reason);
  return r.svg;
};

describe("sanitizeSvg", () => {
  test("keeps a clean svg intact", () => {
    const clean =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs><path d="M0 0h8v8z" fill="url(#g)"/><use href="#g"/></svg>';
    expect(ok(clean)).toBe(clean);
  });
  test("strips script, foreignObject, handlers and external hrefs", () => {
    const out = ok(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="x()"><script>alert(1)</script><foreignObject><div>hi</div></foreignObject><a xlink:href="https://evil.test/x" href="javascript:alert(1)"><rect onclick="y()" width="1" height="1"/></a><image href="data:image/png;base64,AAAA"/><image href="data:image/svg+xml;base64,AAAA"/><use href="#ok"/></svg>',
    );
    expect(out).not.toMatch(
      /script|foreignObject|onload|onclick|evil|javascript/i,
    );
    expect(out).toContain('href="data:image/png;base64,AAAA"');
    expect(out).not.toContain("svg+xml");
    expect(out).toContain('href="#ok"');
    expect(out).toContain("<rect");
  });
  test("drops external css urls and style imports", () => {
    expect(
      ok('<svg><rect style="fill:url(https://e.test/a)"/></svg>'),
    ).not.toContain("e.test");
    expect(
      sanitizeSvg("<svg><style>@import 'https://e.test/a.css';</style></svg>")
        .ok,
    ).toBe(false);
  });
  test("refuses what it cannot parse safely", () => {
    for (const bad of [
      "",
      "<svg>",
      "<svg></g></svg>",
      '<!DOCTYPE svg [<!ENTITY x "y">]><svg/>',
      "<svg><![CDATA[x]]></svg>",
      "<div/>",
      "<svg/><svg/>",
      '<svg a="1" a="2"/>',
      "<svg a=1/>",
    ])
      expect(sanitizeSvg(bad).ok).toBe(false);
  });
});

describe("logo manifest", () => {
  test("validates", () => {
    expect(validateLogoManifest(manifest)).toEqual([]);
  });
  test("rejects bad entries", () => {
    const bad: LogoManifest = {
      providers: {
        x: {
          domain: "x.test",
          retrievedAt: "2026-11-26T00:00:00Z",
          source: "context.dev",
          files: [
            {
              path: "packages/berth/assets/logos/x/icon-light.svg",
              kind: "icon",
              mode: "light",
              sourceUrl: "https://m.test/a.svg?token=1",
            },
          ],
        },
      },
    };
    expect(validateLogoManifest(bad).join()).toContain("without a query");
  });
  test("every catalog provider has files or is listed missing", () => {
    expect(validateProviders(builtInProviders)).toEqual([]);
    for (const p of builtInProviders) {
      const e = manifest.providers[p.meta.id];
      expect(e).toBeDefined();
      if (e && "missing" in e) {
        expect(p.meta.logo.files).toBeUndefined();
        expect(e.reason.length).toBeGreaterThan(0);
      } else expect(p.meta.logo.files).toBeDefined();
    }
  });
  test("every referenced file exists and matches the manifest", () => {
    for (const p of builtInProviders) {
      const files = p.meta.logo.files ?? {};
      const refs = Object.values(files)
        .flatMap((m) => Object.values(m))
        .filter((x): x is string => x !== undefined);
      for (const path of refs) expect(existsSync(`${repo}${path}`)).toBe(true);
      const e = manifest.providers[p.meta.id];
      if (e && !("missing" in e))
        expect(e.files.map((f) => f.path).sort()).toEqual([...refs].sort());
    }
  });
  test("no committed svg has scripts or event handlers", () => {
    for (const dir of readdirSync(logos, { withFileTypes: true })) {
      if (!dir.isDirectory()) continue;
      for (const f of readdirSync(`${logos}/${dir.name}`))
        if (f.endsWith(".svg")) {
          const s = readFileSync(`${logos}/${dir.name}/${f}`, "utf8");
          expect(s).not.toMatch(/<script/i);
          expect(s).not.toMatch(/\son\w+\s*=/i);
          expect(s).not.toMatch(/foreignObject/i);
        }
    }
  });
});
