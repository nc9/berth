import type { Provider } from "../catalog/types.ts";
import { READ_AT } from "./helpers.ts";

export const morph: Provider = {
  meta: {
    id: "morph",
    name: "Morph (Morph Cloud)",
    website: "https://cloud.morph.so",
    docs: "https://cloud.morph.so/docs/developers",
    pricingUrl: "https://cloud.morph.so/web/subscribe",
    description:
      "VM instances started from snapshots, with Infinibranch snapshot, branch and restore.",
    logo: { brandUrl: "https://cloud.morph.so" },
    envVars: ["MORPH_API_KEY"],
    isolation: ["linux-vm"],
    regions: [],
    sizingMode: "snapshot",
    freeTier: "unverified (300 MCUs, from search results)",
    status: "unverified",
    verifiedAt: READ_AT,
  },
  types: [
    {
      id: "instance",
      provider: "morph",
      kind: "free-form",
      vcpu: 1,
      memoryMiB: 4096,
      diskGiB: 16,
      os: ["linux"],
      arch: ["x86_64"],
      isolation: "linux-vm",
      regions: [],
      notes: [
        "1 vCPU / 4096 MB / 16384 MB disk is the docs' snapshot example (image morphvm-minimal), not a documented size list or limit. MB is read as MiB.",
        "Isolation class is unverified: the docs say 'VM' only.",
        "No price: billing is in MCUs (Morph Compute Units) and per-unit rates are not public. Tiers of about $40 and $250 per month are unverified.",
        "Instances have a ttl_seconds. Pause/resume, regions and egress are not documented. 'Snapshot, branch and restore in under 250 ms' is a vendor claim.",
      ],
      capabilities: {
        createFrom: ["snapshot"],
        snapshots: { fs: true, memory: true, fork: true },
        ingress: true,
        discovery: { types: false, regions: false, pricing: "docs" },
      },
    },
  ],
};
