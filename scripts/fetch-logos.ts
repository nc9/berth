// Fetches brand icons and logos for every catalog provider from context.dev.
// Manual only (not run in CI). Usage: bun scripts/fetch-logos.ts
// Needs CONTEXT_DEV_API_KEY in the environment; the key is only ever sent as
// a bearer header and never printed or written.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
  LOGO_DIR,
  LOGO_KINDS,
  LOGO_MODES,
  manifestToLogoFiles,
  validateLogoManifest,
} from "../packages/berth/src/catalog/logo-manifest.ts";
import type {
  LogoManifest,
  ManifestEntry,
  ManifestFile,
} from "../packages/berth/src/catalog/logo-manifest.ts";
import { sanitizeSvg } from "../packages/berth/src/catalog/svg-sanitize.ts";
import { baseProviders } from "../packages/berth/src/data/index.ts";

const MAX_BYTES = 512 * 1024;
const API = "https://api.context.dev/v1/brand/retrieve";
const root = new URL("..", import.meta.url).pathname;

interface BrandLogo {
  url?: string;
  type?: string;
  mode?: string;
  resolution?: { width?: number; height?: number };
}

const stripQuery = (u: string) => {
  const x = new URL(u);
  x.search = "";
  x.hash = "";
  return x.toString();
};

/** Best candidate: SVG over PNG, then the largest. */
export function pick(
  logos: BrandLogo[],
  kind: string,
  mode: string,
): BrandLogo[] {
  const cands = logos.filter(
    (l) => l.type === kind && l.mode === mode && l.url?.startsWith("https://"),
  );
  const isSvg = (l: BrandLogo) => stripQuery(l.url!).endsWith(".svg");
  const area = (l: BrandLogo) =>
    (l.resolution?.width ?? 0) * (l.resolution?.height ?? 0);
  return cands.sort(
    (a, b) => Number(isSvg(b)) - Number(isSvg(a)) || area(b) - area(a),
  );
}

async function download(
  url: string,
): Promise<{ type: "svg" | "png"; bytes: Uint8Array } | string> {
  if (!url.startsWith("https://")) return "not https";
  const res = await fetch(url, { redirect: "error" });
  if (!res.ok) return `HTTP ${res.status}`;
  const ct = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
  const type =
    ct === "image/svg+xml" ? "svg" : ct === "image/png" ? "png" : null;
  if (!type) return `content-type ${ct || "missing"} not allowed`;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) return "over 512 KB";
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) return "over 512 KB";
  return { type, bytes };
}

async function fetchProvider(
  id: string,
  website: string,
  key: string,
): Promise<ManifestEntry> {
  const domain = new URL(website).hostname;
  const base = {
    domain,
    retrievedAt: new Date().toISOString(),
    source: "context.dev" as const,
  };
  const res = await fetch(`${API}?domain=${encodeURIComponent(domain)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok)
    return {
      ...base,
      missing: true,
      reason: `brand API returned HTTP ${res.status}`,
    };
  const body = (await res.json()) as { brand?: { logos?: BrandLogo[] } };
  const logos = body.brand?.logos ?? [];
  if (logos.length === 0)
    return { ...base, missing: true, reason: "brand has no logos" };

  const files: ManifestFile[] = [];
  const notes: string[] = [];
  const dir = `${root}${LOGO_DIR}/${id}`;
  mkdirSync(dir, { recursive: true });
  for (const kind of LOGO_KINDS)
    for (const mode of LOGO_MODES) {
      for (const c of pick(logos, kind, mode)) {
        const got = await download(c.url!).catch(
          (e) => `fetch failed: ${(e as Error).message}`,
        );
        if (typeof got === "string") {
          notes.push(`${kind}-${mode}: ${got}`);
          continue;
        }
        let data: string | Uint8Array = got.bytes;
        if (got.type === "svg") {
          const r = sanitizeSvg(new TextDecoder().decode(got.bytes));
          if (!r.ok) {
            notes.push(`${kind}-${mode}: skipped svg (${r.reason})`);
            continue;
          }
          data = r.svg;
        }
        const path = `${LOGO_DIR}/${id}/${kind}-${mode}.${got.type}`;
        writeFileSync(`${root}${path}`, data);
        files.push({ path, kind, mode, sourceUrl: stripQuery(c.url!) });
        break;
      }
    }
  if (files.length === 0)
    return {
      ...base,
      missing: true,
      reason: notes.length
        ? notes.join("; ")
        : "no light/dark icon or logo offered",
    };
  return { ...base, files, ...(notes.length ? { notes } : {}) };
}

if (import.meta.main) {
  const key = process.env.CONTEXT_DEV_API_KEY;
  if (!key) {
    console.error("CONTEXT_DEV_API_KEY is not set; export it and rerun.");
    process.exit(1);
  }
  rmSync(`${root}${LOGO_DIR}`, { recursive: true, force: true });
  mkdirSync(`${root}${LOGO_DIR}`, { recursive: true });
  const manifest: LogoManifest = { providers: {} };
  for (const p of [...baseProviders].sort((a, b) =>
    a.meta.id.localeCompare(b.meta.id),
  )) {
    const e = await fetchProvider(p.meta.id, p.meta.website, key).catch(
      (err): ManifestEntry => ({
        domain: new URL(p.meta.website).hostname,
        retrievedAt: new Date().toISOString(),
        source: "context.dev",
        missing: true,
        reason: `fetch failed: ${(err as Error).message}`,
      }),
    );
    manifest.providers[p.meta.id] = e;
    console.log(
      p.meta.id,
      "missing" in e ? `missing (${e.reason})` : `${e.files.length} files`,
    );
  }
  const errs = validateLogoManifest(manifest);
  if (errs.length) throw new Error(errs.join("\n"));
  writeFileSync(
    `${root}${LOGO_DIR}/manifest.json`,
    JSON.stringify(manifest, null, 2) + "\n",
  );
  const files = Object.fromEntries(
    Object.entries(manifest.providers).flatMap(([id, e]) => {
      const f = manifestToLogoFiles(e);
      return f ? [[id, f]] : [];
    }),
  );
  writeFileSync(
    `${root}packages/berth/src/data/logo-files.ts`,
    `// Generated by scripts/fetch-logos.ts. Do not edit.\nimport type { LogoFiles } from "../catalog/types.ts";\n\nexport const logoFiles: Record<string, LogoFiles> = ${JSON.stringify(files, null, 2)};\n`,
  );
  console.log("done; run bun fmt before committing");
}
