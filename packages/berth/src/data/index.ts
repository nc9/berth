import type { Provider } from "../catalog/types.ts";
import { aws } from "./aws.ts";
import { azure } from "./azure.ts";
import { beam } from "./beam.ts";
import { blaxel } from "./blaxel.ts";
import { boxd } from "./boxd.ts";
import { cloudflare } from "./cloudflare.ts";
import { fly } from "./fly.ts";
import { gcp } from "./gcp.ts";
import { morph } from "./morph.ts";
import { northflank } from "./northflank.ts";
import { runloop } from "./runloop.ts";
import { vercel } from "./vercel.ts";

export const providers: Provider[] = [
  aws,
  azure,
  gcp,
  boxd,
  morph,
  blaxel,
  vercel,
  cloudflare,
  fly,
  runloop,
  northflank,
  beam,
];
