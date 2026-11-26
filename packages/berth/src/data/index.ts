import type { Provider } from "../catalog/types.ts";
import { aws } from "./aws.ts";
import { azure } from "./azure.ts";
import { beam } from "./beam.ts";
import { blaxel } from "./blaxel.ts";
import { boatdev } from "./boatdev.ts";
import { boxd } from "./boxd.ts";
import { cloudflare } from "./cloudflare.ts";
import { daytona } from "./daytona.ts";
import { e2b } from "./e2b.ts";
import { fly } from "./fly.ts";
import { gcp } from "./gcp.ts";
import { logoFiles } from "./logo-files.ts";
import { modal } from "./modal.ts";
import { morph } from "./morph.ts";
import { northflank } from "./northflank.ts";
import { runloop } from "./runloop.ts";
import { vercel } from "./vercel.ts";

export const baseProviders: Provider[] = [
  aws,
  azure,
  gcp,
  boatdev,
  boxd,
  morph,
  blaxel,
  vercel,
  cloudflare,
  fly,
  runloop,
  northflank,
  beam,
  daytona,
  modal,
  e2b,
];

/** Providers with `logo.files` filled in from the generated logo manifest. */
export const providers: Provider[] = baseProviders.map((p) => {
  const files = logoFiles[p.meta.id];
  return files
    ? { ...p, meta: { ...p.meta, logo: { ...p.meta.logo, files } } }
    : p;
});
