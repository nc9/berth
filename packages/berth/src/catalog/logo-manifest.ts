import type { LogoFiles } from "./types.ts";

export const LOGO_KINDS = ["icon", "logo"] as const;
export const LOGO_MODES = ["light", "dark"] as const;
export const LOGO_DIR = "packages/berth/assets/logos";

export interface ManifestFile {
  path: string;
  kind: (typeof LOGO_KINDS)[number];
  mode: (typeof LOGO_MODES)[number];
  /** The image URL with its query string stripped. */
  sourceUrl: string;
}

export type ManifestEntry =
  | {
      domain: string;
      retrievedAt: string;
      source: "context.dev";
      files: ManifestFile[];
      /** Why an image was skipped (for example an unsafe SVG). */
      notes?: string[];
    }
  | {
      domain: string;
      retrievedAt: string;
      source: "context.dev";
      missing: true;
      reason: string;
    };

export interface LogoManifest {
  providers: Record<string, ManifestEntry>;
}

const isHttps = (s: unknown) =>
  typeof s === "string" && s.startsWith("https://");
const isIso = (s: unknown) =>
  typeof s === "string" && !Number.isNaN(Date.parse(s));

export function validateLogoManifest(m: LogoManifest): string[] {
  const errs: string[] = [];
  for (const [id, e] of Object.entries(m.providers)) {
    const at = `manifest ${id}`;
    if (!e.domain) errs.push(`${at}: domain required`);
    if (!isIso(e.retrievedAt)) errs.push(`${at}: retrievedAt must be ISO`);
    if (e.source !== "context.dev")
      errs.push(`${at}: source must be context.dev`);
    if ("missing" in e) {
      if (e.missing !== true || !e.reason)
        errs.push(`${at}: missing needs a reason`);
      continue;
    }
    if (e.files.length === 0) errs.push(`${at}: no files (use missing: true)`);
    for (const f of e.files) {
      if (
        f.path !==
        `${LOGO_DIR}/${id}/${f.kind}-${f.mode}.${f.path.split(".").pop()}`
      )
        errs.push(`${at}: bad path ${f.path}`);
      if (!/\.(svg|png)$/.test(f.path))
        errs.push(`${at}: bad extension ${f.path}`);
      if (!isHttps(f.sourceUrl) || f.sourceUrl.includes("?"))
        errs.push(`${at}: sourceUrl must be https without a query`);
    }
  }
  return errs;
}

export function manifestToLogoFiles(e: ManifestEntry): LogoFiles | undefined {
  if ("missing" in e) return undefined;
  const out: LogoFiles = {};
  for (const f of e.files) (out[f.kind] ??= {})[f.mode] = f.path;
  return out;
}
